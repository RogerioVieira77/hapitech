import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface GoogleCalendarConnection {
  id: string;
  user_id: string;
  google_email: string;
  calendar_id: string;
  calendar_name: string;
  display_name: string;
  is_always_open: boolean;
  business_hours: BusinessHourEntry[];
  settings: CalendarSettings;
  fields: CalendarFields;
  created_at: string;
  updated_at: string;
}

export interface CalendarSettings {
  google_meet: boolean;
  check_hours: boolean;
  restrict_hours: boolean;
  distribution_mode: "sequential" | "smart";
}

export interface CalendarFields {
  request_name: boolean;
  request_company: boolean;
  request_subject: boolean;
  duration_type: "variable" | "30min" | "60min" | "90min";
  request_email: boolean;
  send_summary: boolean;
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  google_meet: false,
  check_hours: true,
  restrict_hours: false,
  distribution_mode: "sequential",
};

export const DEFAULT_CALENDAR_FIELDS: CalendarFields = {
  request_name: false,
  request_company: true,
  request_subject: true,
  duration_type: "variable",
  request_email: true,
  send_summary: false,
};

export interface BusinessHourEntry {
  day: string;
  enabled: boolean;
  start: string;
  end: string;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  accessRole: string;
}

const DEFAULT_BUSINESS_HOURS: BusinessHourEntry[] = [
  { day: "Segunda-feira", enabled: true, start: "08:00", end: "18:00" },
  { day: "Terça-feira", enabled: true, start: "08:00", end: "18:00" },
  { day: "Quarta-feira", enabled: true, start: "08:00", end: "18:00" },
  { day: "Quinta-feira", enabled: true, start: "08:00", end: "18:00" },
  { day: "Sexta-feira", enabled: true, start: "08:00", end: "18:00" },
  { day: "Sábado", enabled: false, start: "08:00", end: "12:00" },
  { day: "Domingo", enabled: false, start: "08:00", end: "12:00" },
];

export function useGoogleCalendarConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["google_calendar_connections", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await (supabase as any)
        .from("google_calendar_connections")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("google_calendar_connections:", error.message);
        return [];
      }
      return data as GoogleCalendarConnection[];
    },
    enabled: !!user?.id,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("google_calendar_connections")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google_calendar_connections"] });
      toast.success("Agenda removida com sucesso");
    },
    onError: () => toast.error("Erro ao remover agenda"),
  });

  const updateConnection = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<GoogleCalendarConnection> & { id: string }) => {
      const { error } = await (supabase as any)
        .from("google_calendar_connections")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google_calendar_connections"] });
      toast.success("Agenda atualizada com sucesso");
    },
    onError: () => toast.error("Erro ao atualizar agenda"),
  });

  const saveConnection = useMutation({
    mutationFn: async (conn: Omit<GoogleCalendarConnection, "id" | "created_at" | "updated_at">) => {
      const { error } = await (supabase as any)
        .from("google_calendar_connections")
        .insert(conn);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google_calendar_connections"] });
      toast.success("Agenda conectada com sucesso!");
    },
    onError: () => toast.error("Erro ao salvar agenda"),
  });

  return { connections, isLoading, deleteConnection, updateConnection, saveConnection, DEFAULT_BUSINESS_HOURS };
}

// Declare google global type
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: any) => { requestCode: () => void };
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = "132698786512-g8h7i2l30hubgchfnlutkg1dd2fr551n.apps.googleusercontent.com";

/**
 * Opens a Google OAuth popup to get Calendar access without affecting the Supabase session.
 * Returns the calendars, email, and tokens.
 */
export function initiateGoogleOAuthPopup(): Promise<{
  calendars: GoogleCalendar[];
  email: string;
  access_token: string;
  refresh_token: string;
}> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google Identity Services não carregou. Recarregue a página."));
      return;
    }

    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email",
      ux_mode: "popup",
      callback: async (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        try {
          // Exchange the code for tokens via our edge function
          const session = (await supabase.auth.getSession()).data.session;
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          const resp = await fetch(`${supabaseUrl}/functions/v1/google-oauth-token`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anonKey,
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ code: response.code }),
          });

          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Failed to exchange token");
          }

          const data = await resp.json();
          resolve(data);
        } catch (err) {
          reject(err);
        }
      },
    });

    client.requestCode();
  });
}

// Keep backward compatibility - old function now just calls the popup version
export async function initiateGoogleOAuth() {
  toast.error("Use initiateGoogleOAuthPopup instead");
}

export async function fetchGoogleCalendars(providerToken: string): Promise<{ calendars: GoogleCalendar[]; email: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const session = (await supabase.auth.getSession()).data.session;

  const resp = await fetch(`${supabaseUrl}/functions/v1/google-calendar?action=list-calendars`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ provider_token: providerToken }),
  });

  if (!resp.ok) throw new Error("Failed to fetch calendars");
  return resp.json();
}
