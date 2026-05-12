import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface CrmPipeline {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface CrmStage {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  position: number;
  pipeline_id: string | null;
  created_at: string;
}

const DEFAULT_PIPELINE_NAME = "Pipeline Principal";

const DEFAULT_STAGES = [
  { name: "Novo", slug: "novo", position: 0 },
  { name: "Qualificado", slug: "qualificado", position: 1 },
  { name: "Proposta", slug: "proposta", position: 2 },
  { name: "Negociação", slug: "negociacao", position: 3 },
  { name: "Ganho", slug: "ganho", position: 4 },
  { name: "Perdido", slug: "perdido", position: 5 },
];

function makeSlug(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function useCrmPipelines() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["crm_pipelines", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_pipelines")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;

      if (data.length === 0 && user) {
        const { data: newPipeline, error: pErr } = await supabase
          .from("crm_pipelines")
          .insert({ name: DEFAULT_PIPELINE_NAME, position: 0, user_id: user.id })
          .select()
          .single();
        if (pErr) throw pErr;

        const toInsert = DEFAULT_STAGES.map((s) => ({
          ...s,
          user_id: user.id,
          pipeline_id: newPipeline.id,
        }));
        await supabase.from("crm_stages").insert(toInsert);

        return [newPipeline as CrmPipeline];
      }

      return data as CrmPipeline[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const addPipeline = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      const pipelines = query.data ?? [];
      const maxPos = pipelines.length > 0 ? Math.max(...pipelines.map((p) => p.position)) + 1 : 0;
      const { data: newPipeline, error } = await supabase
        .from("crm_pipelines")
        .insert({ name, position: maxPos, user_id: user.id })
        .select()
        .single();
      if (error) throw error;

      const toInsert = DEFAULT_STAGES.map((s) => ({
        ...s,
        user_id: user.id,
        pipeline_id: newPipeline.id,
      }));
      await supabase.from("crm_stages").insert(toInsert);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["crm_stages"] });
      toast.success("Pipeline criada");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const renamePipeline = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("crm_pipelines").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_pipelines"] });
      toast.success("Pipeline renomeada");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["crm_stages"] });
      toast.success("Pipeline removida");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  return {
    pipelines: query.data ?? [],
    isLoading: query.isLoading,
    addPipeline: addPipeline.mutate,
    renamePipeline: renamePipeline.mutate,
    deletePipeline: deletePipeline.mutate,
  };
}

export function useCrmStages(pipelineId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const stagesQuery = useQuery({
    queryKey: ["crm_stages", pipelineId],
    queryFn: async () => {
      let q = supabase
        .from("crm_stages")
        .select("*")
        .order("position", { ascending: true });

      if (pipelineId) {
        q = q.eq("pipeline_id", pipelineId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as CrmStage[];
    },
    enabled: !!user && !!pipelineId,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const addStage = useMutation({
    mutationFn: async (name: string) => {
      if (!user || !pipelineId) throw new Error("Not authenticated");
      const stages = stagesQuery.data ?? [];
      const maxPos = stages.length > 0 ? Math.max(...stages.map((s) => s.position)) + 1 : 0;
      const slug = makeSlug(name);
      const { error } = await supabase
        .from("crm_stages")
        .insert({ name, slug, position: maxPos, user_id: user.id, pipeline_id: pipelineId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_stages"] });
      toast.success("Coluna adicionada");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const renameStage = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const slug = makeSlug(name);
      const { error } = await supabase
        .from("crm_stages")
        .update({ name, slug })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_stages"] });
      toast.success("Coluna renomeada");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_stages"] });
      toast.success("Coluna removida");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const reorderStages = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, i) =>
        supabase.from("crm_stages").update({ position: i }).eq("id", id)
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error);
      if (err?.error) throw err.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm_stages"] });
    },
    onError: (e) => toast.error("Erro ao reordenar: " + e.message),
  });

  return {
    stages: stagesQuery.data ?? [],
    isLoading: stagesQuery.isLoading,
    addStage: addStage.mutate,
    renameStage: renameStage.mutate,
    deleteStage: deleteStage.mutate,
    reorderStages: reorderStages.mutate,
  };
}
