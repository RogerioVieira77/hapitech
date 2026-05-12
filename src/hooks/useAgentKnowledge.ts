import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useAgentKnowledgeFiles(agentId: string) {
  const queryClient = useQueryClient();

  const linkedQuery = useQuery({
    queryKey: ["agent-knowledge", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_knowledge_files")
        .select("id, knowledge_file_id, created_at")
        .eq("agent_id", agentId);
      if (error) throw error;
      return data;
    },
    enabled: !!agentId,
  });

  const linkFile = useMutation({
    mutationFn: async (knowledgeFileId: string) => {
      const { error } = await supabase
        .from("agent_knowledge_files")
        .insert({ agent_id: agentId, knowledge_file_id: knowledgeFileId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-knowledge", agentId] });
      toast.success("Arquivo vinculado ao agente");
    },
    onError: (e) => toast.error("Erro ao vincular: " + e.message),
  });

  const unlinkFile = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("agent_knowledge_files")
        .delete()
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-knowledge", agentId] });
      toast.success("Arquivo desvinculado");
    },
    onError: (e) => toast.error("Erro ao desvincular: " + e.message),
  });

  const linkedFileIds = new Set((linkedQuery.data ?? []).map(l => l.knowledge_file_id));

  return {
    links: linkedQuery.data ?? [],
    linkedFileIds,
    isLoading: linkedQuery.isLoading,
    linkFile: linkFile.mutate,
    unlinkFile: unlinkFile.mutate,
    refetch: linkedQuery.refetch,
  };
}
