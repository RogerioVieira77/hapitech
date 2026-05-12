import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  instructions: string;
  model: string;
  temperature: number;
  status: string;
  conversation_starters: string[];
  avatar_url: string | null;
  connection_id: string | null;
  telegram_connection_id: string | null;
  // Trabalho
  purpose: string;
  communication_style: string;
  product_name: string;
  official_site: string;
  product_description: string;
  // Prompt
  prompt_o_que_fazer: string;
  prompt_como_pergunta: string;
  prompt_nao_fazer: string;
  // Configurações
  transfer_to_human: boolean;
  summary_on_transfer: boolean;
  use_emojis: boolean;
  sign_agent_name: boolean;
  restrict_topics: boolean;
  split_responses: boolean;
  allow_reminders: boolean;
  smart_training_search: boolean;
  agent_timezone: string;
  response_delay_seconds: number;
  max_interactions: number | null;
  // ElevenLabs
  elevenlabs_api_key: string | null;
  elevenlabs_voice_id: string;
  elevenlabs_model: string;
  elevenlabs_enabled: boolean;
  elevenlabs_always_audio: boolean;
  elevenlabs_audio_on_audio: boolean;
  elevenlabs_stability: number;
  elevenlabs_similarity: number;
  elevenlabs_style: number;
  elevenlabs_speed: number;
  elevenlabs_speaker_boost: boolean;
  created_at: string;
  updated_at: string;
}

export function useAgents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agents", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Agent[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (agent: { name: string; instructions?: string; model?: string; temperature?: number }) => {
      const { data, error } = await supabase
        .from("agents")
        .insert({ ...agent, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Agent;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agente criado com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Agent> & { id: string }) => {
      const { data, error } = await supabase
        .from("agents")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Agent;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agente atualizado!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agente removido!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
