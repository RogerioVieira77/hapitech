import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 300_000; // 5 min

async function fetchBotIsOnline(botToken: string): Promise<boolean | null> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.ok === true;
  } catch {
    return null;
  }
}

export function useTelegramConnectionMonitor(
  connections: Array<{ id: string; is_connected: boolean; bot_name: string | null; bot_username: string | null; bot_token: string | null }>,
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevStatesRef = useRef<Map<string, boolean>>(new Map());
  const activeToastsRef = useRef<Set<string>>(new Set());

  const handleGoToConnections = useCallback(() => {
    window.location.href = "/canais";
  }, []);

  useEffect(() => {
    if (!user || connections.length === 0) return;

    const active = connections.filter(c => c.bot_token);
    if (active.length === 0) return;

    active.forEach(c => {
      if (!prevStatesRef.current.has(c.id)) {
        prevStatesRef.current.set(c.id, c.is_connected);
      }
    });

    const poll = async () => {
      for (const conn of active) {
        const isLive = await fetchBotIsOnline(conn.bot_token!);
        if (isLive === null) continue;

        const wasConnected = prevStatesRef.current.get(conn.id) ?? conn.is_connected;
        const displayName = conn.bot_name || conn.bot_username || "Bot Telegram";

        // Transition: online → offline
        if (wasConnected && !isLive && !activeToastsRef.current.has(conn.id)) {
          activeToastsRef.current.add(conn.id);

          await supabase.from("telegram_connections").update({ is_connected: false }).eq("id", conn.id);

          // Log disconnection event
          await (supabase as any).from("connection_events").insert({
            user_id: user.id,
            connection_id: conn.id,
            connection_type: "telegram",
            channel_name: displayName,
            disconnected_at: new Date().toISOString(),
          });

          queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
          queryClient.invalidateQueries({ queryKey: ["connection_events"] });

          toast.warning(`Bot Telegram offline: ${displayName}`, {
            id: `tg-down-${conn.id}`,
            duration: Infinity,
            description: "O token do bot pode ter sido revogado.",
            action: { label: "Ver Canais", onClick: handleGoToConnections },
            onDismiss: () => activeToastsRef.current.delete(conn.id),
          });
        }

        // Transition: offline → online
        if (!wasConnected && isLive && activeToastsRef.current.has(conn.id)) {
          toast.dismiss(`tg-down-${conn.id}`);
          activeToastsRef.current.delete(conn.id);
          toast.success(`Bot Telegram ${displayName} voltou a ficar online!`);

          await supabase.from("telegram_connections").update({ is_connected: true }).eq("id", conn.id);

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

          queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
          queryClient.invalidateQueries({ queryKey: ["connection_events"] });
        }

        prevStatesRef.current.set(conn.id, isLive);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, connections, queryClient, handleGoToConnections]);
}
