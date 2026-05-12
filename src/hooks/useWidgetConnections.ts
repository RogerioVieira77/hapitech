import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface WidgetConnection {
  id: string;
  user_id: string;
  name: string;
  agent_id: string | null;
  primary_color: string;
  welcome_message: string;
  is_active: boolean;
  allowed_domains: string | null;
  created_at: string;
  updated_at: string;
}

export function useWidgetConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["widget_connections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("widget_connections")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WidgetConnection[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const addConnection = useMutation({
    mutationFn: async (payload: { name: string; welcomeMessage?: string; primaryColor?: string; agent_id?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("widget_connections")
        .insert({
          user_id: user.id,
          name: payload.name,
          welcome_message: payload.welcomeMessage || "Olá! Como posso ajudar?",
          primary_color: payload.primaryColor || "#6366f1",
          ...(payload.agent_id ? { agent_id: payload.agent_id } : {}),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget_connections"] });
      toast({ title: "Widget criado com sucesso!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao criar widget", description: err.message, variant: "destructive" });
    },
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("widget_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget_connections"] });
      toast({ title: "Widget removido" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao remover widget", description: err.message, variant: "destructive" });
    },
  });

  return { connections, isLoading, addConnection, deleteConnection };
}
