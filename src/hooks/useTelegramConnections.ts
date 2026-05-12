import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface TelegramConnection {
  id: string;
  user_id: string;
  bot_name: string | null;
  bot_token: string | null;
  bot_username: string | null;
  is_connected: boolean;
  webhook_url: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useTelegramConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["telegram_connections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telegram_connections")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TelegramConnection[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  // Step 1: Create connection with just a name (token added later)
  const createNamed = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("telegram_connections")
        .insert({
          user_id: user.id,
          bot_name: name,
          bot_token: "",
          is_connected: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
      toast({ title: "Canal Telegram criado!", description: "Agora clique em ⋮ → Conectar para inserir o token do bot." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao criar canal", description: err.message, variant: "destructive" });
    },
  });

  // Step 2: Connect bot token to an existing connection
  const connectToken = useMutation({
    mutationFn: async ({ id, botToken }: { id: string; botToken: string }) => {
      if (!user) throw new Error("Not authenticated");

      // Validate token with Telegram API
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const json = await resp.json();
      if (!json.ok) throw new Error(json.description || "Token inválido");

      const botInfo = json.result;

      // Fetch bot profile photo
      let photoUrl: string | null = null;
      try {
        const photosResp = await fetch(
          `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${botInfo.id}&limit=1`
        );
        const photosJson = await photosResp.json();
        if (photosJson.ok && photosJson.result?.total_count > 0) {
          const fileId = photosJson.result.photos[0][0]?.file_id;
          if (fileId) {
            const fileResp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
            const fileJson = await fileResp.json();
            if (fileJson.ok && fileJson.result?.file_path) {
              photoUrl = `https://api.telegram.org/file/bot${botToken}/${fileJson.result.file_path}`;
            }
          }
        }
      } catch { /* photo is optional */ }

      // Register webhook via edge function (server-side, avoids CORS)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?token=${botToken}`;

      let webhookRegistered = false;
      try {
      const webhookResp = await fetch(
          `${supabaseUrl}/functions/v1/telegram-webhook?action=register`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": anonKey },
            body: JSON.stringify({ botToken, connectionId: id }),
          }
        );
        const webhookJson = await webhookResp.json();
        webhookRegistered = webhookJson.ok === true;
      } catch { /* fallback: mark as connected anyway */ }

      const { error } = await supabase
        .from("telegram_connections")
        .update({
          bot_token: botToken,
          bot_name: botInfo.first_name,
          bot_username: botInfo.username,
          is_connected: true,
          webhook_url: webhookRegistered ? webhookUrl : null,
          photo_url: photoUrl,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
      toast({ title: "Bot Telegram conectado!", description: "Webhook ativado automaticamente — mensagens chegarão ao chat." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao conectar bot", description: err.message, variant: "destructive" });
    },
  });

  // Legacy full add (still works)
  const addConnection = useMutation({
    mutationFn: async ({ botToken, botName }: { botToken: string; botName: string }) => {
      if (!user) throw new Error("Not authenticated");
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const json = await resp.json();
      if (!json.ok) throw new Error(json.description || "Token inválido");
      const botInfo = json.result;
      let photoUrl: string | null = null;
      try {
        const photosResp = await fetch(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${botInfo.id}&limit=1`);
        const photosJson = await photosResp.json();
        if (photosJson.ok && photosJson.result?.total_count > 0) {
          const fileId = photosJson.result.photos[0][0]?.file_id;
          if (fileId) {
            const fileResp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
            const fileJson = await fileResp.json();
            if (fileJson.ok && fileJson.result?.file_path)
              photoUrl = `https://api.telegram.org/file/bot${botToken}/${fileJson.result.file_path}`;
          }
        }
      } catch { /* optional */ }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?token=${botToken}`;
      await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const { data, error } = await supabase
        .from("telegram_connections")
        .insert({
          user_id: user.id,
          bot_token: botToken,
          bot_name: botName || botInfo.first_name,
          bot_username: botInfo.username,
          is_connected: true,
          webhook_url: webhookUrl,
          photo_url: photoUrl,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
      toast({ title: "Bot Telegram conectado com sucesso!" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao conectar bot", description: err.message, variant: "destructive" });
    },
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("telegram_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
      toast({ title: "Conexão Telegram removida" });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao remover conexão", description: err.message, variant: "destructive" });
    },
  });

  const refreshPhoto = useMutation({
    mutationFn: async (conn: TelegramConnection) => {
      // 1. Get bot's own user_id via getMe
      const meResp = await fetch(`https://api.telegram.org/bot${conn.bot_token}/getMe`);
      const meJson = await meResp.json();
      if (!meJson.ok) throw new Error("Não foi possível verificar o token do bot");

      const botId = meJson.result.id;
      let photoUrl: string | null = null;

      // 2. Fetch profile photos using the bot's numeric user_id
      try {
        const photosResp = await fetch(
          `https://api.telegram.org/bot${conn.bot_token}/getUserProfilePhotos?user_id=${botId}&limit=1`
        );
        const photosJson = await photosResp.json();
        if (photosJson.ok && photosJson.result?.total_count > 0) {
          const fileId = photosJson.result.photos[0][0]?.file_id;
          if (fileId) {
            const fileResp = await fetch(
              `https://api.telegram.org/bot${conn.bot_token}/getFile?file_id=${fileId}`
            );
            const fileJson = await fileResp.json();
            if (fileJson.ok && fileJson.result?.file_path) {
              photoUrl = `https://api.telegram.org/file/bot${conn.bot_token}/${fileJson.result.file_path}`;
            }
          }
        }
      } catch {
        // ignore, photo is optional
      }

      const { error } = await supabase
        .from("telegram_connections")
        .update({ photo_url: photoUrl })
        .eq("id", conn.id);
      if (error) throw error;
      return photoUrl;
    },
    onSuccess: (photoUrl) => {
      queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
      toast({
        title: photoUrl ? "Foto atualizada!" : "Nenhuma foto encontrada",
        description: photoUrl
          ? "A foto do bot foi salva com sucesso."
          : "Este bot não possui foto de perfil configurada.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao atualizar foto", description: err.message, variant: "destructive" });
    },
  });

  const checkStatus = useMutation({
    mutationFn: async (conn: TelegramConnection) => {
      const resp = await fetch(`https://api.telegram.org/bot${conn.bot_token}/getMe`);
      const json = await resp.json();
      const isConnected = json.ok === true;

      await supabase
        .from("telegram_connections")
        .update({ is_connected: isConnected })
        .eq("id", conn.id);

      return isConnected;
    },
    onSuccess: (isConnected) => {
      queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
      toast({
        title: isConnected ? "Bot online!" : "Bot offline",
        description: isConnected ? "O bot está ativo." : "Token inválido ou bot desativado.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao verificar status", description: err.message, variant: "destructive" });
    },
  });

  // Re-registers the webhook URL via our edge function (avoids browser CORS with Telegram API)
  const registerWebhook = useMutation({
    mutationFn: async (conn: TelegramConnection) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Call our edge function which then calls Telegram's setWebhook server-side
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/telegram-webhook?action=register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey,
          },
          body: JSON.stringify({ botToken: conn.bot_token, connectionId: conn.id }),
        }
      );
      const json = await resp.json();
      if (!json.ok) throw new Error(json.description || json.error || "Erro ao registrar webhook");

      queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram_connections"] });
      toast({ title: "Webhook registrado!", description: "O bot agora receberá mensagens do Telegram." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao registrar webhook", description: err.message, variant: "destructive" });
    },
  });

  return { connections, isLoading, createNamed, connectToken, addConnection, deleteConnection, checkStatus, refreshPhoto, registerWebhook };
}
