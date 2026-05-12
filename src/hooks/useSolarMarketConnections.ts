import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface SolarMarketConnection {
  id: string;
  user_id: string;
  api_key: string;
  company_name: string | null;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

export function useSolarMarketConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["solarmarket_connections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solarmarket_connections")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SolarMarketConnection[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const addConnection = useMutation({
    mutationFn: async (params: { apiKey: string; companyName?: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Validate API key first
      const { data: validation, error: valError } = await supabase.functions.invoke("solarmarket-query", {
        body: { action: "validate_key", params: { api_key: params.apiKey } },
      });

      if (valError) throw new Error("Erro ao validar chave de API");
      if (!validation?.valid) {
        throw new Error(validation?.error || "Chave de API inválida");
      }

      const { data, error } = await supabase
        .from("solarmarket_connections")
        .insert({
          user_id: user.id,
          api_key: params.apiKey,
          company_name: params.companyName || "Minha Empresa",
          is_connected: true,
        })
        .select()
        .single();
      if (error) {
        console.error("[SolarMarket] Insert error:", error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solarmarket_connections"] });
      toast({ title: "Solar Market conectado com sucesso!" });
    },
    onError: (err: Error) => {
      console.error("[SolarMarket] Mutation error:", err);
      toast({ title: "Erro ao conectar Solar Market", description: err.message, variant: "destructive" });
    },
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("solarmarket_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solarmarket_connections"] });
      toast({ title: "Conexão Solar Market removida" });
    },
  });

  return { connections, isLoading, addConnection, deleteConnection };
}
