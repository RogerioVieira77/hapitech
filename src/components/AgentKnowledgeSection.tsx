import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, Link2, Unlink2, Loader2, Type, Globe, Video, File, Search, Trash2, MoreVertical, CheckCircle2, Upload } from "lucide-react";
import { useKnowledgeFiles, type KnowledgeFile } from "@/hooks/useKnowledgeFiles";
import { useAgentKnowledgeFiles } from "@/hooks/useAgentKnowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tab = "texto" | "website" | "video" | "documento";

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "texto", label: "Texto", icon: Type },
  { key: "website", label: "Website", icon: Globe },
  { key: "video", label: "Vídeo", icon: Video },
  { key: "documento", label: "Documento", icon: File },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Scrape progress component ─────────────────────────────────────────────────
const STAGES = [
  { key: "connecting", label: "Conectando ao site" },
  { key: "fetching",   label: "Baixando página" },
  { key: "extracting", label: "Extraindo texto" },
  { key: "saving",     label: "Salvando conteúdo" },
] as const;

type ScrapeStageKey = typeof STAGES[number]["key"];

function ScrapeProgress({ stage, chars }: { stage: ScrapeStageKey; chars: number }) {
  const currentIdx = STAGES.findIndex(s => s.key === stage);

  // Overall progress: each stage = 25%
  const pct = Math.min(100, ((currentIdx + 1) / STAGES.length) * 100);

  return (
    <div className="pt-1 space-y-3">
      {/* Progress bar */}
      <div className="relative h-1 rounded-full bg-border/30 overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
      </div>

      {/* Stages */}
      <div className="flex items-center justify-between gap-1">
        {STAGES.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s.key} className="flex flex-col items-center gap-1 flex-1">
              <div className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                done ? "bg-primary" : active ? "bg-primary animate-pulse" : "bg-border/40"
              }`} />
              <span className={`text-[9px] text-center leading-tight transition-colors duration-300 ${
                active ? "text-primary font-medium" : done ? "text-muted-foreground/60" : "text-muted-foreground/30"
              }`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Char counter — only show during extracting/saving */}
      {chars > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50"
        >
          <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
          <span>
            <span className="tabular-nums font-medium text-foreground/60">
              {chars.toLocaleString("pt-BR")}
            </span>{" "}
            caracteres extraídos...
          </span>
        </motion.div>
      )}
    </div>
  );
}


interface Props {
  agentId: string;
}

export function AgentKnowledgeSection({ agentId }: Props) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("texto");
  const [textInput, setTextInput] = useState("");
  const [websiteInput, setWebsiteInput] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [isAddingText, setIsAddingText] = useState(false);
  const [isScrapingWebsite, setIsScrapingWebsite] = useState(false);
  const [isExtractingVideo, setIsExtractingVideo] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [scrapeStage, setScrapeStage] = useState<"connecting" | "fetching" | "extracting" | "saving" | null>(null);
  const [scrapeChars, setScrapeChars] = useState(0);
  const scrapeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const { files, isLoading: filesLoading, refetch: refetchFiles } = useKnowledgeFiles();
  const { links, linkedFileIds, isLoading: linksLoading, linkFile, unlinkFile, refetch: refetchLinks } = useAgentKnowledgeFiles(agentId);

  const isLoading = filesLoading || linksLoading;
  const getLinkId = (fileId: string) => links.find(l => l.knowledge_file_id === fileId)?.id;

  // All files linked to this agent (texts, websites, documents)
  const agentFiles = files.filter(f => linkedFileIds.has(f.id));
  const textFiles = agentFiles.filter((f: KnowledgeFile) => f.source_type === "text");
  const websiteFiles = agentFiles.filter((f: KnowledgeFile) => f.source_type === "website");
  const videoFiles = agentFiles.filter((f: KnowledgeFile) => f.source_type === "video");
  const documentFiles = agentFiles.filter((f: KnowledgeFile) => !f.source_type || f.source_type === "document");

  // ── Extract YouTube video transcript ──────────────────────────────────────
  const addVideo = async () => {
    if (!videoInput.trim() || !user) return;

    setIsExtractingVideo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-transcript`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ url: videoInput.trim(), agentId }),
        }
      );

      const json = await resp.json();

      if (!resp.ok || !json.ok) {
        throw new Error(json.error || `Erro ${resp.status}`);
      }

      setVideoInput("");
      toast.success(`Vídeo processado! ${(json.charCount ?? 0).toLocaleString("pt-BR")} caracteres extraídos.`);
      refetchFiles?.();
      refetchLinks?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao processar vídeo";
      toast.error(message);
    } finally {
      setIsExtractingVideo(false);
    }
  };

  // ── Save text as real knowledge_file ─────────────────────────────────────
  const addText = async () => {
    if (!textInput.trim() || !user) return;
    setIsAddingText(true);
    try {
      const content = textInput.trim();
      const contentBytes = new TextEncoder().encode(content);
      const fileName = `texto-${Date.now()}.txt`;
      const storagePath = `texts/${user.id}/${Date.now()}.txt`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("knowledge")
        .upload(storagePath, contentBytes, { contentType: "text/plain", upsert: false });

      if (uploadError) throw new Error("Erro ao salvar no storage: " + uploadError.message);

      // Insert knowledge_file
      const { data: kfData, error: kfError } = await supabase
        .from("knowledge_files")
        .insert({
          user_id: user.id,
          file_name: fileName,
          file_size: contentBytes.length,
          file_type: "txt",
          storage_path: storagePath,
          status: "uploaded",
          source_type: "text",
          content,
        })
        .select("id")
        .single();

      if (kfError) throw new Error("Erro ao salvar texto: " + kfError.message);

      // Link to agent
      await supabase
        .from("agent_knowledge_files")
        .insert({ agent_id: agentId, knowledge_file_id: kfData.id });

      // Trigger async embedding generation (fire-and-forget)
      const { data: { session } } = await supabase.auth.getSession();
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ knowledge_file_id: kfData.id }),
      }).catch(() => {/* ignore — embeddings are optional */});

      setTextInput("");
      toast.success("Texto salvo e vinculado ao agente!");
      refetchFiles?.();
      refetchLinks?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar texto");
    } finally {
      setIsAddingText(false);
    }
  };

  // ── Scrape website and save as real knowledge_file ────────────────────────
  const addWebsite = async () => {
    if (!websiteInput.trim() || !user) return;

    let url = websiteInput.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    setIsScrapingWebsite(true);
    setScrapeStage("connecting");
    setScrapeChars(0);

    // Simulate staged progress while real fetch runs
    const STAGE_TIMINGS: { stage: typeof scrapeStage; delay: number; charTarget: number }[] = [
      { stage: "connecting", delay: 0,    charTarget: 0 },
      { stage: "fetching",   delay: 1200, charTarget: 0 },
      { stage: "extracting", delay: 3500, charTarget: 12000 },
      { stage: "saving",     delay: 8000, charTarget: 30000 },
    ];

    STAGE_TIMINGS.forEach(({ stage, delay }) => {
      setTimeout(() => {
        setScrapeStage(prev => prev !== null ? stage : prev);
      }, delay);
    });

    // Animate char counter during "extracting" stage
    let charInterval: ReturnType<typeof setInterval> | null = null;
    const startCharAnimation = () => {
      let count = 0;
      charInterval = setInterval(() => {
        count += Math.floor(Math.random() * 800 + 400);
        setScrapeChars(count);
      }, 120);
      scrapeTimerRef.current = charInterval;
    };
    const extractingTimer = setTimeout(startCharAnimation, 3500);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-website`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ url, agentId }),
        }
      );

      const json = await resp.json();

      if (!resp.ok || !json.ok) {
        throw new Error(json.error || `Erro ${resp.status}`);
      }

      // Show real char count from response
      if (charInterval) clearInterval(charInterval);
      clearTimeout(extractingTimer);
      setScrapeChars(json.charCount ?? 0);

      toast.success(`Site treinado! ${json.charCount?.toLocaleString()} caracteres extraídos.`);
      setWebsiteInput("");

      // Trigger async embedding generation for the newly scraped website
      if (json.knowledgeFileId) {
        const { data: { session } } = await supabase.auth.getSession();
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ knowledge_file_id: json.knowledgeFileId }),
        }).catch(() => {/* ignore — embeddings are optional */});
      }

      refetchFiles?.();
      refetchLinks?.();
    } catch (err: any) {
      if (charInterval) clearInterval(charInterval);
      clearTimeout(extractingTimer);
      toast.error(err.message || "Erro ao treinar website");
    } finally {
      if (scrapeTimerRef.current) clearInterval(scrapeTimerRef.current);
      setIsScrapingWebsite(false);
      setScrapeStage(null);
      setScrapeChars(0);
    }
  };

  // ── Upload document files directly ────────────────────────────────────────
  const ACCEPTED_DOC_TYPES = ".pdf,.txt,.csv";
  const uploadDocuments = useCallback(async (docFiles: File[]) => {
    if (!user || docFiles.length === 0) return;
    setIsUploadingDoc(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? "";

      for (const file of docFiles) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "unknown";
        const safeName = file.name
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${user.id}/${Date.now()}-${safeName}`;
        const isPdf = ext === "pdf";

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("knowledge")
          .upload(storagePath, file);
        if (uploadError) throw uploadError;

        // Insert knowledge_file
        const { data: kfData, error: kfError } = await supabase
          .from("knowledge_files")
          .insert({
            user_id: user.id,
            file_name: file.name,
            file_type: ext,
            file_size: file.size,
            storage_path: storagePath,
            status: isPdf ? "processing" : "ready",
            source_type: "document",
          } as any)
          .select("id")
          .single();
        if (kfError) throw kfError;

        // Link to agent
        await supabase
          .from("agent_knowledge_files")
          .insert({ agent_id: agentId, knowledge_file_id: kfData.id });

        if (isPdf) {
          // Trigger PDF extraction
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-pdf`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ knowledgeFileId: kfData.id }),
          }).then(async () => {
            // After PDF extraction, trigger embeddings
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-embeddings`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({ knowledge_file_id: kfData.id }),
            }).catch(() => {});
          }).catch((err) => {
            console.error("PDF extraction failed:", err);
            supabase.from("knowledge_files").update({ status: "error" }).eq("id", kfData.id);
          });
        } else {
          // For TXT/CSV: read content directly
          try {
            const text = await file.text();
            if (text.trim()) {
              await supabase
                .from("knowledge_files")
                .update({ content: text.slice(0, 100000), status: "ready" })
                .eq("id", kfData.id);
              // Trigger embeddings
              fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-embeddings`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ knowledge_file_id: kfData.id }),
              }).catch(() => {});
            }
          } catch { /* ignore */ }
        }
      }

      toast.success(`${docFiles.length} documento(s) enviado(s) e vinculado(s) ao agente!`);
      refetchFiles?.();
      refetchLinks?.();
    } catch (err: any) {
      toast.error("Erro ao enviar documento: " + err.message);
    } finally {
      setIsUploadingDoc(false);
    }
  }, [user, agentId, refetchFiles, refetchLinks]);

  const handleDocDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "pdf" || ext === "txt" || ext === "csv";
    });
    if (dropped.length) uploadDocuments(dropped);
  }, [uploadDocuments]);

  const handleDocFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    if (selected.length) uploadDocuments(selected);
    if (docInputRef.current) docInputRef.current.value = "";
  }, [uploadDocuments]);

  // ── Unlink + delete knowledge file ───────────────────────────────────────
  const deleteKnowledgeFile = async (fileId: string) => {
    const linkId = getLinkId(fileId);
    if (linkId) await supabase.from("agent_knowledge_files").delete().eq("id", linkId);
    await supabase.from("knowledge_files").delete().eq("id", fileId);
    refetchFiles?.();
    refetchLinks?.();
    toast.success("Treinamento removido");
  };

  const filteredFiles = files.filter(f =>
    f.file_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <Input
            placeholder="Buscar treinamento"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-9 bg-background/50 border-border/30 text-sm placeholder:text-muted-foreground/30 rounded-xl"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border/20">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium transition-colors relative whitespace-nowrap ${
                activeTab === tab.key
                  ? "text-primary"
                  : "text-muted-foreground/50 hover:text-foreground/70"
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="training-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.13 }}
          className="space-y-3"
        >

          {/* ── TEXTO ── */}
          {activeTab === "texto" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/25 bg-background/40 overflow-hidden">
                <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                  <Type className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
                  <span className="text-[11px] text-muted-foreground/50 font-medium">Novo treinamento via texto</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/30 tabular-nums">{textInput.length}/1028</span>
                </div>
                <Textarea
                  value={textInput}
                  onChange={e => setTextInput(e.target.value.slice(0, 1028))}
                  placeholder="Escreva um texto com informações para treinar o agente..."
                  rows={4}
                  className="border-0 bg-transparent resize-none text-[13px] leading-relaxed focus-visible:ring-0 px-4 py-2 rounded-none"
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addText();
                    }
                  }}
                />
                <div className="flex items-center justify-end px-3 pb-3 pt-1 border-t border-border/15">
                  <Button
                    size="sm"
                    onClick={addText}
                    disabled={!textInput.trim() || isAddingText}
                    className="h-7 text-xs px-4"
                  >
                    {isAddingText ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Salvando...</> : "Cadastrar"}
                  </Button>
                </div>
              </div>

              {/* Saved text entries */}
              {textFiles
                .filter((f: KnowledgeFile) => !searchTerm || f.content?.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((file: KnowledgeFile) => (
                  <div key={file.id} className="flex items-start gap-3 px-3 py-3 rounded-xl border border-border/20 bg-background/30 group">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary/60 shrink-0 mt-0.5" strokeWidth={1.5} />
                    <p className="flex-1 text-[13px] leading-relaxed text-foreground/80 line-clamp-2">{file.content || file.file_name}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-primary/10 text-primary border-0">Treinado</Badge>
                      <button
                        onClick={() => deleteKnowledgeFile(file.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* ── WEBSITE ── */}
          {activeTab === "website" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/25 bg-background/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
                  <span className="text-[11px] text-muted-foreground/50 font-medium">Adicionar URL do website</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={websiteInput}
                    onChange={e => setWebsiteInput(e.target.value)}
                    placeholder="https://exemplo.com.br"
                    className="flex-1 h-9 bg-background/50 border-border/30 text-[13px]"
                    onKeyDown={e => e.key === "Enter" && addWebsite()}
                    disabled={isScrapingWebsite}
                  />
                  <Button
                    size="sm"
                    onClick={addWebsite}
                    disabled={!websiteInput.trim() || isScrapingWebsite}
                    className="h-9 text-xs px-4 min-w-[90px]"
                  >
                    {isScrapingWebsite
                      ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Lendo...</>
                      : "Cadastrar"}
                  </Button>
                </div>

                {/* ── Scrape progress ── */}
                <AnimatePresence>
                  {isScrapingWebsite && scrapeStage && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <ScrapeProgress stage={scrapeStage} chars={scrapeChars} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isScrapingWebsite && (
                  <p className="text-[10px] text-muted-foreground/35">
                    O conteúdo do site será extraído automaticamente e usado para treinar o agente.
                  </p>
                )}
              </div>

              {websiteFiles
                .filter((f: KnowledgeFile) => !searchTerm || f.source_url?.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((file: KnowledgeFile) => (
                  <div key={file.id} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border/20 bg-background/30 group">
                    <Globe className="h-3.5 w-3.5 text-primary/60 shrink-0" strokeWidth={1.5} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-foreground/80 truncate">{file.source_url || file.file_name}</p>
                      <p className="text-[11px] text-muted-foreground/40">{formatSize(file.file_size)} extraídos</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-primary/10 text-primary border-0">Treinado</Badge>
                      <button
                        onClick={() => deleteKnowledgeFile(file.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* ── VÍDEO ── */}
          {activeTab === "video" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/25 bg-background/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Video className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
                  <span className="text-[11px] text-muted-foreground/50 font-medium">Adicionar URL do vídeo (YouTube)</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={videoInput}
                    onChange={e => setVideoInput(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... ou https://youtu.be/..."
                    className="flex-1 h-9 bg-background/50 border-border/30 text-[13px]"
                    onKeyDown={e => e.key === "Enter" && !isExtractingVideo && addVideo()}
                    disabled={isExtractingVideo}
                  />
                  <Button
                    size="sm"
                    className="h-9 text-xs px-4"
                    onClick={addVideo}
                    disabled={isExtractingVideo || !videoInput.trim()}
                  >
                    {isExtractingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Extrair"}
                  </Button>
                </div>
                {isExtractingVideo ? (
                  <p className="text-[10px] text-primary/60 flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Extraindo legendas do vídeo... isso pode levar alguns segundos.
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground/35">
                    A transcrição/legendas do vídeo serão extraídas e usadas para treinar o agente.
                  </p>
                )}
              </div>

              {videoFiles
                .filter((f: any) => !searchTerm || f.source_url?.toLowerCase().includes(searchTerm.toLowerCase()) || f.file_name?.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((file: any) => (
                  <div key={file.id} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border/20 bg-background/30 group">
                    <Video className="h-3.5 w-3.5 text-primary/60 shrink-0" strokeWidth={1.5} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-foreground/80 truncate">{file.source_url || file.file_name}</p>
                      <p className="text-[11px] text-muted-foreground/40">{formatSize(file.file_size)} extraídos</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-primary/10 text-primary border-0">Treinado</Badge>
                      <button
                        onClick={() => deleteKnowledgeFile(file.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* ── DOCUMENTO ── */}
          {activeTab === "documento" && (
            <div className="space-y-3">
              {/* Upload area */}
              <div
                onDrop={handleDocDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => docInputRef.current?.click()}
                className="group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/30 bg-background/30 py-8 cursor-pointer hover:border-border/50 hover:bg-background/40 transition-all"
              >
                {isUploadingDoc ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Upload className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
                )}
                <div className="text-center">
                  <p className="text-[12px] text-foreground/70 font-medium">
                    {isUploadingDoc ? "Enviando..." : "Arraste arquivos ou clique para enviar"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">PDF, TXT, CSV</p>
                </div>
                <input
                  ref={docInputRef}
                  type="file"
                  accept={ACCEPTED_DOC_TYPES}
                  multiple
                  className="hidden"
                  onChange={handleDocFileChange}
                />
              </div>

              {/* Linked document files */}
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-xs">Carregando...</span>
                </div>
              ) : documentFiles.length === 0 ? (
                <div className="text-center py-6 rounded-xl border border-dashed border-border/20">
                  <FileText className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-[11px] text-muted-foreground/40">Nenhum documento vinculado a este agente.</p>
                </div>
              ) : (
                documentFiles
                  .filter((f: KnowledgeFile) => !searchTerm || f.file_name?.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((file: KnowledgeFile) => (
                    <div key={file.id} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border/20 bg-background/30 group">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
                        {file.status === "processing" ? (
                          <Loader2 className="h-4 w-4 text-primary animate-spin" strokeWidth={1.5} />
                        ) : (
                          <FileText className="h-4 w-4 text-primary/70" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{file.file_name}</p>
                        <p className="text-[11px] text-muted-foreground/40">
                          {formatSize(file.file_size)} · {file.file_type.toUpperCase()}
                          {file.status === "processing" && " · Processando..."}
                          {file.status === "error" && " · Erro na extração"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-primary/10 text-primary border-0">
                          {file.status === "processing" ? "Processando" : file.status === "error" ? "Erro" : "Treinado"}
                        </Badge>
                        <button
                          onClick={() => deleteKnowledgeFile(file.id)}
                          className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
