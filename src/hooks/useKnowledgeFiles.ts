import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface KnowledgeFile {
  id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  status: string;
  source_type?: string;
  source_url?: string | null;
  content?: string | null;
  created_at: string;
  updated_at: string;
}

const EXTRACT_PDF_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-pdf`;

async function triggerPdfExtraction(knowledgeFileId: string, accessToken: string): Promise<void> {
  const res = await fetch(EXTRACT_PDF_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ knowledgeFileId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

export function useKnowledgeFiles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const filesQuery = useQuery({
    queryKey: ["knowledge-files", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_files")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as KnowledgeFile[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
    // Poll every 4 seconds to catch status updates from the edge function
    refetchInterval: (query) => {
      const files = query.state.data as KnowledgeFile[] | undefined;
      const hasProcessing = files?.some((f) => f.status === "processing");
      return hasProcessing ? 4000 : false;
    },
  });

  const uploadFiles = useMutation({
    mutationFn: async (files: File[]) => {
      if (!user) throw new Error("Not authenticated");
      setUploading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? "";

      const results = [];
      const pdfIds: string[] = [];

      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "unknown";
        const safeName = file.name
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${user.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("knowledge")
          .upload(storagePath, file);

        if (uploadError) throw uploadError;

        // PDFs start as "processing"; other files are immediately "ready"
        const isPdf = ext === "pdf";

        const { data, error: insertError } = await supabase
          .from("knowledge_files")
          .insert({
            user_id: user.id,
            file_name: file.name,
            file_type: ext,
            file_size: file.size,
            storage_path: storagePath,
            status: isPdf ? "processing" : "ready",
            source_type: "document",
          })
          .select()
          .single();

        if (insertError) throw insertError;
        results.push(data);

        if (isPdf) {
          pdfIds.push(data.id);
        } else {
          // For TXT/CSV: read as text and save content directly
          try {
            const text = await file.text();
            if (text.trim()) {
              await supabase
                .from("knowledge_files")
                .update({ content: text.slice(0, 100000), status: "ready" })
                .eq("id", data.id);
            }
          } catch { /* ignore — content will be read from storage */ }
        }
      }

      // Trigger async PDF extraction for each PDF (fire-and-forget display wise)
      for (const pdfId of pdfIds) {
        triggerPdfExtraction(pdfId, accessToken).catch((err) => {
          console.error(`PDF extraction failed for ${pdfId}:`, err);
          // Mark as error in DB
          supabase
            .from("knowledge_files")
            .update({ status: "error" })
            .eq("id", pdfId)
            .then(() => queryClient.invalidateQueries({ queryKey: ["knowledge-files"] }));
        });
      }

      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-files"] });
      const pdfs = data.filter((f: KnowledgeFile) => f.file_type === "pdf");
      const others = data.filter((f: KnowledgeFile) => f.file_type !== "pdf");

      if (pdfs.length && others.length) {
        toast.success(`${others.length} arquivo(s) prontos. ${pdfs.length} PDF(s) em processamento...`);
      } else if (pdfs.length) {
        toast.info(`${pdfs.length} PDF(s) enviado(s) — extraindo texto...`);
      } else {
        toast.success(`${data.length} arquivo(s) enviado(s) com sucesso`);
      }
      setUploading(false);
    },
    onError: (error) => {
      toast.error("Erro ao enviar arquivo: " + error.message);
      setUploading(false);
    },
  });

  const deleteFile = useMutation({
    mutationFn: async (file: KnowledgeFile) => {
      const { error: storageError } = await supabase.storage
        .from("knowledge")
        .remove([file.storage_path]);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("knowledge_files")
        .delete()
        .eq("id", file.id);
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-files"] });
      toast.success("Arquivo removido");
    },
    onError: (error) => {
      toast.error("Erro ao remover: " + error.message);
    },
  });

  return {
    files: filesQuery.data ?? [],
    isLoading: filesQuery.isLoading,
    uploading,
    uploadFiles: uploadFiles.mutate,
    deleteFile: deleteFile.mutate,
    refetch: filesQuery.refetch,
  };
}
