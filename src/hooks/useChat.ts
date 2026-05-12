import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgUserIds } from "@/hooks/useOrgUserIds";

const getConversationTime = (conversation: Conversation) => {
  const ts = conversation.last_message_at ?? conversation.created_at;
  return new Date(ts).getTime();
};

export interface Conversation {
  id: string;
  user_id: string;
  connection_id: string | null;
  remote_jid: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_sender: string | null;
  last_message_media_type: string | null;
  unread_count: number;
  is_ai_active: boolean;
  agent_id: string | null;
  assigned_to: string | null;
  profile_picture_url: string | null;
  is_resolved?: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  remote_jid: string;
  content: string;
  sender: "user" | "agent" | "human";
  message_id: string | null;
  media_url: string | null;
  media_type: string | null;
  timestamp: string;
}

const sortConversations = (items: Conversation[]) => {
  return [...items].sort((a, b) => getConversationTime(b) - getConversationTime(a));
};

export function useConversations(onNewMessage?: (conv?: { contact_name?: string | null; last_message?: string | null }) => void) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;
  const { data: orgUserIds, isLoading: orgLoading } = useOrgUserIds();
  const uids = orgUserIds ?? [];
  const orgReady = !orgLoading && uids.length > 0;

  const query = useQuery({
    queryKey: ["conversations", uids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .in("user_id", uids)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Conversation[];
    },
    enabled: !!user && orgReady,
    staleTime: 10 * 60_000, // 10min — realtime handles updates
    refetchInterval: 120_000, // 2min safety fallback (realtime is primary)
    refetchIntervalInBackground: false,
    refetchOnMount: false,
  });

  // Single realtime channel for all org users; update cache directly to avoid extra fetches
  useEffect(() => {
    if (!user || !orgReady || uids.length === 0) return;

    const channel = supabase
      .channel(`conversations-realtime-org`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        (payload) => {
          const row = (payload.new || payload.old) as Conversation | undefined;
          if (!row?.user_id || !uids.includes(row.user_id)) return;

          if (payload.eventType === "DELETE") {
            queryClient.setQueryData<Conversation[]>(["conversations", uids], (current = []) =>
              current.filter((conversation) => conversation.id !== row.id)
            );
            return;
          }

          const updated = payload.new as Conversation | null;
          if (!updated) return;

          queryClient.setQueryData<Conversation[]>(["conversations", uids], (current = []) => {
            const index = current.findIndex((conversation) => conversation.id === updated.id);
            if (index === -1) return sortConversations([updated, ...current]);

            const merged = [...current];
            merged[index] = { ...merged[index], ...updated };
            return sortConversations(merged);
          });

          if ((payload.eventType === "UPDATE" || payload.eventType === "INSERT") && updated.unread_count > 0) {
            onNewMessageRef.current?.({
              contact_name: updated.contact_name,
              last_message: updated.last_message,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient, orgReady, JSON.stringify(uids)]);

  const toggleAi = useCallback(async (conversationId: string, currentValue: boolean) => {
    const newAi = !currentValue;
    const updates: any = { is_ai_active: newAi, updated_at: new Date().toISOString() };
    if (currentValue && user) updates.assigned_to = user.id;
    if (!currentValue) updates.assigned_to = null;

    // Optimistic cache update — no refetch needed
    queryClient.setQueryData<Conversation[]>(["conversations", uids], (current = []) =>
      current.map(c => c.id === conversationId ? { ...c, ...updates } : c)
    );

    await supabase.from("conversations").update(updates).eq("id", conversationId);
  }, [user, queryClient, uids]);

  const markAsRead = useCallback(async (conversationId: string) => {
    // Optimistic cache update — no refetch needed
    queryClient.setQueryData<Conversation[]>(["conversations", uids], (current = []) =>
      current.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c)
    );

    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
  }, [user, queryClient, uids]);

  return {
    conversations: query.data || [],
    isLoading: query.isLoading,
    toggleAi,
    markAsRead,
  };
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!conversationId && !!user,
    staleTime: 10 * 60_000, // 10min — realtime handles new messages
    refetchInterval: 5000, // fallback when realtime event is missed
    refetchIntervalInBackground: true,
    refetchOnMount: false,
  });

  // Real-time subscription for messages; update cache directly to avoid refetch storm
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as Message | null;
          if (!incoming) return;

          queryClient.setQueryData<Message[]>(["messages", conversationId], (current = []) => {
            if (current.some((message) => message.id === incoming.id)) return current;
            return [...current, incoming].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user, queryClient]);

  return {
    messages: query.data || [],
    isLoading: query.isLoading,
  };
}

export function useSendMessage() {
  const { user } = useAuth();

  const sendMessage = useCallback(async (
    conversationId: string,
    remoteJid: string,
    content: string,
    connectionId: string | null,
    isAiActive: boolean,
  ) => {
    if (!user) return;

    // Save message to DB
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      remote_jid: remoteJid,
      content,
      sender: isAiActive ? "agent" : "human",
      message_id: `sent-${Date.now()}`,
      timestamp: new Date().toISOString(),
    });

    // Update conversation
    await supabase
      .from("conversations")
      .update({
        last_message: content,
        last_message_at: new Date().toISOString(),
        last_message_sender: isAiActive ? "agent" : "human",
        last_message_media_type: null,
      } as any)
      .eq("id", conversationId);

    // Send via Evolution API if WhatsApp conversation
    const isWhatsApp = remoteJid.endsWith("@s.whatsapp.net");
    if (isWhatsApp) {
      let connId = connectionId;

      // Fallback: find any active WhatsApp connection in the org
      if (!connId) {
        try {
          const { data: orgData } = await (supabase.rpc as any)("get_user_org_id", { _user_id: user.id });
          let fallbackUids = [user.id];
          if (orgData) {
            const { data: members } = await supabase
              .from("organization_members")
              .select("user_id")
              .eq("organization_id", orgData);
            if (members) fallbackUids = members.map(m => m.user_id);
          }
          const { data: anyConn } = await supabase
            .from("wuzapi_connections")
            .select("id")
            .in("user_id", fallbackUids)
            .eq("is_connected", true)
            .limit(1)
            .maybeSingle();
          connId = anyConn?.id ?? null;
        } catch { /* ignore */ }
      }

      if (connId) {
        try {
          await supabase.functions.invoke("wuzapi-proxy", {
            body: {
              action: "send-message",
              connectionId: connId,
              body: {
                number: remoteJid.replace("@s.whatsapp.net", ""),
                text: content,
              },
            },
          });
        } catch (err) {
          console.error("Failed to send via WhatsApp:", err);
        }
      }
    }

    // Send via Telegram if this is a Telegram conversation
    if (remoteJid.startsWith("telegram:")) {
      try {
        const chatId = remoteJid.replace("telegram:", "");

        // 1. Try to find bot token via the conversation's agent -> telegram_connection_id
        let botToken: string | null = null;

        if (conversationId) {
          // Get agent_id from the conversation
          const { data: conv } = await supabase
            .from("conversations")
            .select("agent_id")
            .eq("id", conversationId)
            .maybeSingle();

          if (conv?.agent_id) {
            // Get telegram_connection_id from the agent
            const { data: agent } = await supabase
              .from("agents")
              .select("telegram_connection_id")
              .eq("id", conv.agent_id)
              .maybeSingle();

            if (agent?.telegram_connection_id) {
              const { data: tgConn } = await supabase
                .from("telegram_connections")
                .select("bot_token")
                .eq("id", agent.telegram_connection_id)
                .maybeSingle();
              botToken = tgConn?.bot_token ?? null;
            }
          }
        }

        // 2. Fallback: any connected bot in the org
        if (!botToken) {
          const { data: orgData } = await (supabase.rpc as any)("get_user_org_id", { _user_id: user.id });
          let tgUids = [user.id];
          if (orgData) {
            const { data: members } = await supabase
              .from("organization_members")
              .select("user_id")
              .eq("organization_id", orgData);
            if (members) tgUids = members.map(m => m.user_id);
          }
          const { data: anyConn } = await supabase
            .from("telegram_connections")
            .select("bot_token")
            .in("user_id", tgUids)
            .eq("is_connected", true)
            .maybeSingle();
          botToken = anyConn?.bot_token ?? null;
        }

        if (botToken) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const resp = await fetch(
            `${supabaseUrl}/functions/v1/telegram-webhook?action=send`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": anonKey,
              },
              body: JSON.stringify({ botToken, chatId, text: content }),
            }
          );
          const json = await resp.json();
          if (!json.ok) {
            console.error("Telegram send failed:", json);
          } else {
            console.log("Telegram message sent to chatId:", chatId);
          }
        } else {
          console.error("No Telegram bot token found for this conversation");
        }
      } catch (err) {
        console.error("Failed to send via Telegram:", err);
      }
    }
  }, [user]);

  return { sendMessage };
}
