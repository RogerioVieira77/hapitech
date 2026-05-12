import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 300_000; // 5 min

async function fetchIsConnected(connectionId: string): Promise<boolean | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const { data, error } = await supabase.functions.invoke("wuzapi-proxy", {
      body: { action: "status", connectionId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      // If the connection no longer exists, treat as disconnected
      const errorMsg = typeof error === 'object' && error.message ? error.message : String(error);
      if (errorMsg.includes("não encontrada") || errorMsg.includes("not found")) {
        return false;
      }
      return null;
    }
    const state = data?.instance?.state || data?.state;
    return state === "open";
  } catch {
    return null;
  }
}

export function useWhatsAppConnectionMonitor(
  connections: Array<{ id: string; is_connected: boolean; phone_number: string | null }>,
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevStatesRef = useRef<Map<string, boolean>>(new Map());
  const activeToastsRef = useRef<Set<string>>(new Set());

  const handleReconnect = useCallback(async (connectionId: string, phone: string) => {
    const toastId = toast.loading("Gerando QR Code para reconexão...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("wuzapi-proxy", {
        body: { action: "connect", connectionId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw new Error(error.message);

      const base64 = data?.base64 || data?.qrcode?.base64 || data?.code;
      toast.dismiss(toastId);

      if (base64) {
        const imgSrc = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
        toast.success("QR Code gerado! Abra Canais para escanear.", {
          duration: 15000,
          action: { label: "Abrir Canais", onClick: () => { window.location.href = "/canais"; } },
        });
        // Dispatch custom event so the Canais page can pick up the QR
        window.dispatchEvent(new CustomEvent("wa-qr-ready", { detail: { connectionId, imgSrc, phone } }));
      } else if (data?.instance?.state === "open") {
        toast.success(`WhatsApp ${phone} reconectado!`);
        await supabase.from("wuzapi_connections").update({ is_connected: true }).eq("id", connectionId);
        queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
        activeToastsRef.current.delete(connectionId);
      } else {
        toast.info("Não foi possível gerar QR. Abra Canais para tentar manualmente.", {
          action: { label: "Abrir", onClick: () => { window.location.href = "/canais"; } },
        });
      }
    } catch {
      toast.dismiss(toastId);
      toast.error("Erro ao reconectar. Acesse Canais para tentar manualmente.");
    }
  }, [queryClient]);

  useEffect(() => {
    if (!user || connections.length === 0) return;

    connections.forEach(c => {
      if (!prevStatesRef.current.has(c.id)) {
        prevStatesRef.current.set(c.id, c.is_connected);
      }
    });

    const poll = async () => {
      for (const conn of connections) {
        const isLive = await fetchIsConnected(conn.id);
        if (isLive === null) continue;

        const wasConnected = prevStatesRef.current.get(conn.id) ?? conn.is_connected;
        const phone = conn.phone_number?.replace(/-[a-f0-9]{12,}$/, "") || "WhatsApp";

        // Transition: online → offline
        if (wasConnected && !isLive && !activeToastsRef.current.has(conn.id)) {
          activeToastsRef.current.add(conn.id);

          await supabase.from("wuzapi_connections").update({ is_connected: false }).eq("id", conn.id);

          // Log disconnection event
          await (supabase as any).from("connection_events").insert({
            user_id: user.id,
            connection_id: conn.id,
            connection_type: "whatsapp",
            channel_name: phone,
            disconnected_at: new Date().toISOString(),
          });

          queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
          queryClient.invalidateQueries({ queryKey: ["connection_events"] });

          toast.warning(`Conexão WhatsApp caiu: ${phone}`, {
            id: `wa-down-${conn.id}`,
            duration: Infinity,
            description: "Clique para reconectar automaticamente.",
            action: {
              label: "Reconectar",
              onClick: () => handleReconnect(conn.id, phone),
            },
            onDismiss: () => activeToastsRef.current.delete(conn.id),
          });
        }

        // Transition: offline → online
        if (!wasConnected && isLive && activeToastsRef.current.has(conn.id)) {
          toast.dismiss(`wa-down-${conn.id}`);
          activeToastsRef.current.delete(conn.id);
          toast.success(`WhatsApp ${phone} reconectado!`);

          await supabase.from("wuzapi_connections").update({ is_connected: true }).eq("id", conn.id);

          // Close the open incident with duration
          const { data: openEvent } = await (supabase as any)
            .from("connection_events")
            .select("id, disconnected_at")
            .eq("connection_id", conn.id)
            .is("reconnected_at", null)
            .order("disconnected_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (openEvent) {
            const durationSeconds = Math.round(
              (Date.now() - new Date(openEvent.disconnected_at).getTime()) / 1000,
            );
            await (supabase as any)
              .from("connection_events")
              .update({ reconnected_at: new Date().toISOString(), duration_seconds: durationSeconds })
              .eq("id", openEvent.id);
          }

          queryClient.invalidateQueries({ queryKey: ["evolution-connections"] });
          queryClient.invalidateQueries({ queryKey: ["connection_events"] });
        }

        prevStatesRef.current.set(conn.id, isLive);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, connections, queryClient, handleReconnect]);
}
