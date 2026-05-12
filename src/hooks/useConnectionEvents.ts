import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ConnectionEvent {
  id: string;
  user_id: string;
  connection_id: string;
  connection_type: "whatsapp" | "telegram";
  channel_name: string | null;
  disconnected_at: string;
  reconnected_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export function useConnectionEvents(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["connection_events", user?.id, limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("connection_events")
        .select("*")
        .eq("user_id", user!.id)
        .order("disconnected_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as ConnectionEvent[];
    },
    enabled: !!user,
  });
}

/** Formats seconds into human-readable duration like "2h 14min" or "48s" */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}min`;
}
