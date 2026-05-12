import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UserSettings {
  notif_sound: boolean;
  notif_desktop: boolean;
  compact_mode: boolean;
  language: string;
}

const DEFAULTS: UserSettings = {
  notif_sound: true,
  notif_desktop: false,
  compact_mode: false,
  language: "pt-BR",
};

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load from Supabase on mount
  useEffect(() => {
    if (!user) return;

    supabase
      .from("profiles")
      .select("notif_sound, notif_desktop, compact_mode, language")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            notif_sound: data.notif_sound ?? DEFAULTS.notif_sound,
            notif_desktop: data.notif_desktop ?? DEFAULTS.notif_desktop,
            compact_mode: data.compact_mode ?? DEFAULTS.compact_mode,
            language: data.language ?? DEFAULTS.language,
          });
        }
        setLoading(false);
      });
  }, [user]);

  const updateSetting = useCallback(
    async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      setSettings(prev => ({ ...prev, [key]: value }));

      if (!user) return;
      setSaving(true);
      await supabase
        .from("profiles")
        .update({ [key]: value, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      setSaving(false);
    },
    [user]
  );

  return { settings, loading, saving, updateSetting };
}
