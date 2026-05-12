import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface EvolutionConnection {
  id: string;
  user_id: string;
  instance_url: string;
  api_token: string;
  is_connected: boolean;
  phone_number: string | null;
}

export interface EvolutionProfile {
  profileName: string | null;
  profilePictureUrl: string | null;
  owner: string | null;
  status: string | null;
}

async function invokeEvolution(action: string, extra?: Record<string, unknown>, retries = 0): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  try {
    const { data, error } = await supabase.functions.invoke("wuzapi-proxy", {
      body: { action, ...extra },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) throw new Error(error.message || "Edge function error");
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    if (retries < 2) {
      const delay = (retries + 1) * 2000;
      await new Promise(r => setTimeout(r, delay));
      return invokeEvolution(action, extra, retries + 1);
    }
    throw err;
  }
}

export function useEvolutionApi() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch ALL connections for the user
  const connectionsQuery = useQuery({
    queryKey: ["evolution-connections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wuzapi_connections")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as EvolutionConnection[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const saveConfig = useMutation({
    mutationFn: async ({ instanceName }: { instanceName: string }) => {
      return invokeEvolution("save-config", { instanceName });
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
      const connId = data?.data?.id;
      toast.success("Instância criada! Gerando QR Code...");
      try {
        const result = await invokeEvolution("create-instance", {
          instanceName: data?.data?.phone_number,
          connectionId: connId,
        });
        if (result?.qrcode?.base64 || result?.base64) {
          toast.success("QR Code gerado! Escaneie para conectar.");
        } else if (result?.message) {
          toast.info(result.message);
        }
      } catch (e) {
        // Show error message if available
        const errorMsg = e instanceof Error ? e.message : "Erro ao criar instância";
        toast.error(errorMsg);
      }
      // Refresh connections
      queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteConfig = useMutation({
    mutationFn: async (connectionId: string) => {
      // Try to delete the instance on Evolution API first
      const conn = connectionsQuery.data?.find(c => c.id === connectionId);
      if (conn) {
        try {
          await invokeEvolution("delete-instance", { connectionId });
        } catch {
          // Instance may not exist
        }
      }
      return invokeEvolution("delete-config", { connectionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
      toast.success("Instância removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    connections: connectionsQuery.data || [],
    isLoading: connectionsQuery.isLoading,
    saveConfig,
    deleteConfig,
  };
}

/** Hook for a single instance's operations */
export function useEvolutionInstance(connectionId: string) {
  const queryClient = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const profileQuery = useQuery({
    queryKey: ["evolution-profile", connectionId],
    queryFn: async () => {
      try {
        const data = await invokeEvolution("fetch-profile", { connectionId });
        const instances = Array.isArray(data) ? data : [];
        const inst = instances[0];
        if (!inst) return null;
        return {
          profileName: inst.profileName || inst.name || null,
          profilePictureUrl: inst.profilePicUrl || inst.profilePictureUrl || null,
          owner: (inst.ownerJid || inst.owner || "")?.replace("@s.whatsapp.net", "") || null,
          status: inst.connectionStatus || inst.status || null,
        } as EvolutionProfile;
      } catch {
        // Instance may not exist yet on Evolution API (race condition)
        return null;
      }
    },
    enabled: !!connectionId,
    refetchInterval: false,
    retry: false,
  });

  const fetchQr = useCallback(async () => {
    setQrLoading(true);
    try {
      const data = await invokeEvolution("connect", { connectionId });
      const base64 = data?.base64 || data?.qrcode?.base64 || data?.code;
      if (base64) {
        const clean = base64.replace(/^data:image\/[a-z]+;base64,/, "");
        setQrCode(clean);
      } else if (data?.instance?.state === "open") {
        toast.success("WhatsApp já está conectado!");
        queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
      } else {
        toast.info("QR Code não disponível. Tente novamente.");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar QR");
    } finally {
      setQrLoading(false);
    }
  }, [connectionId, queryClient]);

  const checkStatus = useMutation({
    mutationFn: () => invokeEvolution("status", { connectionId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
      const state = data?.instance?.state || data?.state;
      if (state === "open") {
        toast.success("WhatsApp conectado!");
        setQrCode(null);
        queryClient.invalidateQueries({ queryKey: ["evolution-profile", connectionId] });
      } else {
        toast.info(`Status: ${state || "desconhecido"}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logout = useMutation({
    mutationFn: async () => {
      const toastId = toast.loading("Desconectando WhatsApp...");
      try {
        const result = await invokeEvolution("logout", { connectionId });
        toast.dismiss(toastId);
        return result;
      } catch (err) {
        toast.dismiss(toastId);
        throw err;
      }
    },
    onSuccess: async () => {
      setQrCode(null);
      await queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
      await queryClient.invalidateQueries({ queryKey: ["evolution-profile", connectionId] });
      toast.success("Sessão encerrada com sucesso!");
    },
    onError: (e: Error) => toast.error(`Falha ao desconectar após tentativas. ${e.message}`, {
      duration: 8000,
      action: { label: "Tentar novamente", onClick: () => logout.mutate() },
    }),
  });

  const restart = useMutation({
    mutationFn: () => invokeEvolution("restart", { connectionId }),
    onSuccess: () => {
      toast.info("Reiniciada. Buscando QR Code...");
      setTimeout(() => fetchQr(), 3000);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-poll status when QR code is showing
  useEffect(() => {
    if (qrCode) {
      pollingRef.current = setInterval(async () => {
        try {
          const data = await invokeEvolution("status", { connectionId });
          const state = data?.instance?.state || data?.state;
          if (state === "open") {
            setQrCode(null);
            toast.success("WhatsApp conectado!");
            queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
            queryClient.invalidateQueries({ queryKey: ["evolution-profile", connectionId] });
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        } catch {
          // ignore
        }
      }, 5000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [qrCode, connectionId, queryClient]);

  return {
    profile: profileQuery.data ?? null,
    qrCode,
    qrLoading,
    fetchQr,
    checkStatus,
    logout,
    restart,
  };
}
