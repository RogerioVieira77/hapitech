import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface ClinicorpConnection {
  id: string;
  user_id: string;
  clinic_id: string;
  api_key: string;
  clinic_name: string | null;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

export function useClinicorpConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["clinicorp_connections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinicorp_connections")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClinicorpConnection[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const addConnection = useMutation({
    mutationFn: async (params: { clinicId: string; apiKey: string; clinicName?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("clinicorp_connections")
        .insert({
          user_id: user.id,
          clinic_id: params.clinicId,
          api_key: params.apiKey,
          clinic_name: params.clinicName || `Clínica ${params.clinicId}`,
          is_connected: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicorp_connections"] });
      toast({ title: "Clinicorp conectado com sucesso!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao conectar Clinicorp", description: err.message, variant: "destructive" });
    },
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinicorp_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicorp_connections"] });
      toast({ title: "Conexão removida" });
    },
  });

  const updateClinicName = useMutation({
    mutationFn: async ({ id, clinic_name }: { id: string; clinic_name: string }) => {
      const { error } = await supabase
        .from("clinicorp_connections")
        .update({ clinic_name, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicorp_connections"] });
      toast({ title: "Nome da clínica atualizado!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao atualizar nome", description: err.message, variant: "destructive" });
    },
  });

  return { connections, isLoading, addConnection, deleteConnection, updateClinicName };
}
