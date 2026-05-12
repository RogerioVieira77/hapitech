import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
  Search, Send, Bot, User, MoreVertical, ArrowLeft, MessageSquare,
  Image, FileText, Film, Mic, X, ZoomIn, ZoomOut, Download,
  Square, ChevronDown, CheckCheck, UserCheck, Smile, Plus,
  RotateCcw, CircleCheckBig, PanelRightOpen, LayoutGrid, Kanban,
  ArrowRightLeft, Trash2, Ban, Eraser, Tag,
} from "lucide-react";
import ContactDetailPanel from "@/components/ContactDetailPanel";
import { TagAssignPopover, TagBadge, TagFilterPopover } from "@/components/TagManager";
import { useTags } from "@/hooks/useTags";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { useConversations, useMessages, useSendMessage } from "@/hooks/useChat";
import { useOrgUserIds } from "@/hooks/useOrgUserIds";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useSettings } from "@/hooks/useSettings";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import whatsappLogo from "@/assets/whatsapp-logo.webp";
import telegramLogo from "@/assets/telegram-logo.png";
import instagramLogo from "@/assets/instagram-logo.png";
import webchatLogo from "@/assets/webchat-logo.png";
import AudioPlayer from "@/components/AudioPlayer";
import { ChatMediaContent } from "@/components/ChatMediaContent";
import { uploadChatMedia, createSendableUrl } from "@/lib/media";

/* ── Helpers ─────────────────────────────────────────────── */

function getChannelLogo(remoteJid: string) {
  if (remoteJid?.startsWith("telegram:")) return { src: telegramLogo, alt: "Telegram", bg: "bg-[#29a8e0]" };
  if (remoteJid?.startsWith("instagram:")) return { src: instagramLogo, alt: "Instagram", bg: "bg-[#E4405F]" };
  if (remoteJid?.startsWith("widget:")) return { src: webchatLogo, alt: "Webchat", bg: "bg-[#6366f1]" };
  return { src: whatsappLogo, alt: "WhatsApp", bg: "bg-[#25D366]" };
}

function getInitials(name: string | null) {
  if (!name) return "??";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function titleCase(name: string | null) {
  if (!name) return name;
  return name.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function formatDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((today.getTime() - msgDate.getTime()) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}



type ChatFilter = "todos" | "espera" | "andamento" | "meus" | "arquivadas";

/* ── Avatar ──────────────────────────────────────────────── */

function Avatar({ name, pictureUrl, size = 40 }: { name: string | null; pictureUrl?: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const px = `${size}px`;
  if (pictureUrl && !err) {
    return <img src={pictureUrl} alt={name || ""} className="rounded-xl object-cover ring-1 ring-border/10" style={{ width: px, height: px }} onError={() => setErr(true)} />;
  }
  return (
    <div className="rounded-xl bg-accent/8 ring-1 ring-border/10 flex items-center justify-center text-[11px] font-bold text-accent" style={{ width: px, height: px }}>
      {getInitials(name)}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────── */

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { settings } = useSettings();
  const { play: playNotification } = useNotificationSound(settings.notif_sound);
  const { data: orgUserIds } = useOrgUserIds();
  const orgUids = orgUserIds ?? (user ? [user.id] : []);

  // UI state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ChatFilter>("espera");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Media upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: string; file: File } | null>(null);

  // Audio recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferType, setTransferType] = useState<"agent" | "human">("agent");
  const [transferTargetId, setTransferTargetId] = useState<string>("");
  const [transferSearch, setTransferSearch] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState<Set<string>>(new Set());
  const [newConvPhone, setNewConvPhone] = useState("");
  const [newConvCountry, setNewConvCountry] = useState("+55");
  const [startingConv, setStartingConv] = useState(false);
  const [signName, setSignName] = useState(() => {
    const stored = localStorage.getItem("chat-sign-name");
    return stored === null ? true : stored === "true";
  });
  // Tags
  const { tags, getTagsForConversation, getConversationIdsForTag } = useTags();

  const handleToggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagFilter(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  const handleStartConversation = useCallback(async () => {
    const phone = newConvPhone.replace(/\D/g, "");
    if (!phone || phone.length < 8 || !user) return;
    setStartingConv(true);
    try {
      const fullPhone = newConvCountry.replace("+", "") + phone;
      const remoteJid = `${fullPhone}@s.whatsapp.net`;
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", user.id)
        .eq("remote_jid", remoteJid)
        .maybeSingle();
      if (existing) {
        setSelectedId(existing.id);
        setMobileShowChat(true);
        setNewConvPhone("");
        toast.info("Conversa já existe");
      } else {
        const { data: newConv, error } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id,
            remote_jid: remoteJid,
            contact_phone: fullPhone,
            contact_name: fullPhone,
            is_ai_active: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        setSelectedId(newConv.id);
        setMobileShowChat(true);
        setNewConvPhone("");
        toast.success("Conversa iniciada");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao iniciar conversa");
    } finally {
      setStartingConv(false);
    }
  }, [newConvPhone, newConvCountry, user]);

  // ── Formatters ──
  function formatTime(dateStr: string | null) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return t("chat.yesterday");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  const MEDIA_LABELS = [t("chat.image"), t("chat.video"), t("chat.audio"), t("chat.document"), t("chat.sticker")];
  function isMediaPlaceholder(content: string, mediaType: string | null) {
    if (!mediaType) return false;
    const trimmed = content.trim().replace(/[\[\]]/g, "").replace(/📷|🎥|🎵|📄|🏷️/g, "").trim();
    return MEDIA_LABELS.includes(trimmed) || !trimmed;
  }

  const formatRecordingTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Data ──
  const handleNewMessage = useCallback((conv?: { contact_name?: string | null; last_message?: string | null }) => {
    playNotification();
    const orig = document.title;
    document.title = t("chat.newMessage");
    setTimeout(() => { document.title = orig; }, 3000);

    // Desktop notification
    if (settings.notif_desktop && "Notification" in window && Notification.permission === "granted") {
      const title = conv?.contact_name || t("chat.newMessage");
      const body = conv?.last_message || "";
      new Notification(title, {
        body,
        icon: "/favicon.ico",
      });
    }
  }, [playNotification, t, settings.notif_desktop]);

  const { conversations, isLoading, toggleAi, markAsRead } = useConversations(handleNewMessage);
  const selected = conversations.find(c => c.id === selectedId);
  const { messages } = useMessages(selectedId);
  const { sendMessage } = useSendMessage();

  const { data: agents } = useQuery({
    queryKey: ["agents-list", orgUids],
    queryFn: async () => {
      const { data } = await supabase.from("agents").select("id, name, avatar_url").in("user_id", orgUids);
      return data || [];
    },
    enabled: !!user && orgUids.length > 0,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const { data: orgMembers } = useQuery({
    queryKey: ["org-members-transfer", user?.id],
    queryFn: async () => {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!membership) return [];
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", membership.organization_id);
      if (!members || members.length === 0) return [];
      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);
      // Fetch emails via security definer function
      let emailMap: Record<string, string> = {};
      try {
        const { data: emailData } = await (supabase.rpc as any)("get_org_members_with_email");
        if (emailData) {
          for (const e of emailData) emailMap[e.user_id] = e.email;
        }
      } catch (err) {
        console.error("Failed to fetch org member emails:", err);
      }
      return members.map(m => {
        const profile = profiles?.find(p => p.user_id === m.user_id);
        const email = emailMap[m.user_id] || null;
        const rawName = profile?.display_name || "";
        // If display_name looks like an email or is empty, use email username as fallback
        const isEmailLike = rawName.includes("@");
        const displayName = rawName && !isEmailLike ? rawName : (email ? email.split("@")[0] : "Sem nome");
        return {
          user_id: m.user_id,
          role: m.role,
          display_name: displayName,
          avatar_url: profile?.avatar_url || null,
          email,
        };
      });
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const agentMap = useMemo(() => {
    const map: Record<string, { name: string; avatar_url: string | null }> = {};
    agents?.forEach(a => { map[a.id] = { name: a.name, avatar_url: a.avatar_url }; });
    return map;
  }, [agents]);

  const memberMap = useMemo(() => {
    const map: Record<string, { display_name: string; avatar_url: string | null }> = {};
    orgMembers?.forEach(m => { map[m.user_id] = { display_name: m.display_name, avatar_url: m.avatar_url }; });
    return map;
  }, [orgMembers]);

  // ── Filters ──
  // "Em espera" = IA atendendo (is_ai_active)
  // "Andamento" = outro humano atendendo (is_ai_active false AND assigned_to is someone else)
  // "Meus" = atribuído ao meu usuário (assigned_to === user.id)
  const filtered = useMemo(() => {
    let list = conversations.filter(c =>
      (c.contact_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.last_message || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
    const isResolved = (c: any) => !!(c as any).is_resolved;
    if (activeFilter === "arquivadas") {
      list = list.filter(c => isResolved(c));
    } else {
      list = list.filter(c => !isResolved(c));
      if (activeFilter === "espera") list = list.filter(c => c.is_ai_active);
      else if (activeFilter === "andamento") list = list.filter(c => !c.is_ai_active && c.assigned_to && c.assigned_to !== user?.id);
      else if (activeFilter === "meus") list = list.filter(c => !c.is_ai_active && (c.assigned_to === user?.id || (!c.assigned_to && c.last_message_sender === "human")));
    }
    // Apply tag filter
    if (selectedTagFilter.size > 0) {
      const allowedIds = new Set<string>();
      selectedTagFilter.forEach(tagId => {
        getConversationIdsForTag(tagId).forEach(id => allowedIds.add(id));
      });
      list = list.filter(c => allowedIds.has(c.id));
    }
    return list;
  }, [conversations, searchTerm, activeFilter, user?.id, selectedTagFilter, getConversationIdsForTag]);

  const filterCounts = useMemo(() => {
    const notResolved = conversations.filter(c => !(c as any).is_resolved);
    const resolved = conversations.filter(c => !!(c as any).is_resolved);
    const sumUnread = (list: typeof conversations) => list.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
    return {
      espera: sumUnread(notResolved.filter(c => c.is_ai_active)),
      andamento: sumUnread(notResolved.filter(c => !c.is_ai_active && c.assigned_to && c.assigned_to !== user?.id)),
      meus: sumUnread(notResolved.filter(c => !c.is_ai_active && (c.assigned_to === user?.id || (!c.assigned_to && c.last_message_sender === "human")))),
      arquivadas: sumUnread(resolved),
    };
  }, [conversations, user?.id]);

  const groupedConversations = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(c => {
      const key = c.last_message_at ? formatDateGroup(c.last_message_at) : "Sem data";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map, ([date, convs]) => ({ date, convs }));
  }, [filtered]);

  // ── Effects ──
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [selectedId, messages.length]);

  // ── Handlers ──
  const handleSelect = (id: string) => { setSelectedId(id); setMobileShowChat(true); markAsRead(id); };

  const handleSend = async () => {
    if (!newMessage.trim() || !selected) return;
    let content = newMessage.trim();
    if (signName && !selected.is_ai_active) {
      const myName = memberMap[user?.id ?? ""]?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Atendente";
      content = `*${myName}*\n\n${content}`;
    }
    setNewMessage("");
    await sendMessage(selected.id, selected.remote_jid, content, selected.connection_id, selected.is_ai_active);
  };

  const handleToggleAi = () => { if (selected) toggleAi(selected.id, selected.is_ai_active); };

  // ── File upload ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document";
    setMediaPreview({ url: URL.createObjectURL(file), type, file });
    e.target.value = "";
  };

  const handleSendMedia = async () => {
    if (!mediaPreview || !selected || !user) return;
    setUploadingMedia(true);
    try {
      const { file, type } = mediaPreview;
      const path = `${user.id}/${Date.now()}.${file.name.split(".").pop()}`;
      const storedPath = await uploadChatMedia(path, file, file.type);
      const content = type === "image" ? t("chat.image") : type === "video" ? t("chat.video") : file.name;

      await supabase.from("messages").insert({ conversation_id: selected.id, user_id: user.id, remote_jid: selected.remote_jid, content, sender: selected.is_ai_active ? "agent" : "human", media_type: type, media_url: storedPath, message_id: `sent-${Date.now()}`, timestamp: new Date().toISOString() });
      await supabase.from("conversations").update({ last_message: content, last_message_at: new Date().toISOString(), last_message_sender: selected.is_ai_active ? "agent" : "human", last_message_media_type: type } as any).eq("id", selected.id);

      const sendableUrl = await createSendableUrl(storedPath);
      if (selected.remote_jid.startsWith("telegram:")) {
        const chatId = selected.remote_jid.replace("telegram:", "");
        const session = await supabase.auth.getSession();
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook?action=send-media`, { method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.data.session?.access_token}` }, body: JSON.stringify({ chatId, mediaUrl: sendableUrl, mediaType: type, caption: "", fileName: file.name }) });
        const json = await resp.json(); if (!json.ok) toast.error(`Telegram: ${json.description || "Error"}`);
      } else if (selected.connection_id) {
        const { error: pErr } = await supabase.functions.invoke("wuzapi-proxy", { body: { action: "send-media", connectionId: selected.connection_id, body: { number: selected.remote_jid.replace("@s.whatsapp.net", ""), mediatype: type === "image" ? "image" : type === "video" ? "video" : "document", mimetype: file.type, caption: "", media: sendableUrl, fileName: file.name } } });
        if (pErr) toast.error(pErr.message);
      }
      setMediaPreview(null);
    } catch { toast.error("Error"); } finally { setUploadingMedia(false); }
  };

  // ── Audio ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => { const blob = new Blob(audioChunksRef.current, { type: "audio/webm" }); setAudioBlob(blob); setAudioPreviewUrl(URL.createObjectURL(blob)); stream.getTracks().forEach(t => t.stop()); };
      mr.start();
      setIsRecording(true); setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch { alert(t("chat.micDenied")); }
  };
  const stopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); };
  const cancelRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false); setAudioBlob(null); setAudioPreviewUrl(null); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); };

  const handleSendAudio = async () => {
    if (!audioBlob || !selected || !user) return;
    setUploadingMedia(true);
    try {
      const path = `${user.id}/${Date.now()}.webm`;
      const storedPath = await uploadChatMedia(path, audioBlob, "audio/webm");

      await supabase.from("messages").insert({ conversation_id: selected.id, user_id: user.id, remote_jid: selected.remote_jid, content: t("chat.audio"), sender: selected.is_ai_active ? "agent" : "human", media_type: "audio", media_url: storedPath, message_id: `sent-${Date.now()}`, timestamp: new Date().toISOString() });
      await supabase.from("conversations").update({ last_message: t("chat.audio"), last_message_at: new Date().toISOString(), last_message_sender: selected.is_ai_active ? "agent" : "human", last_message_media_type: "audio" } as any).eq("id", selected.id);

      const sendableUrl = await createSendableUrl(storedPath);
      if (selected.remote_jid.startsWith("telegram:")) {
        const chatId = selected.remote_jid.replace("telegram:", "");
        const session = await supabase.auth.getSession();
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook?action=send-media`, { method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.data.session?.access_token}` }, body: JSON.stringify({ chatId, mediaUrl: sendableUrl, mediaType: "audio", caption: "" }) });
        const json = await resp.json(); if (!json.ok) toast.error(`Telegram: ${json.description || "Error"}`);
      } else if (selected.connection_id) {
        const { error: pErr } = await supabase.functions.invoke("wuzapi-proxy", { body: { action: "send-audio", connectionId: selected.connection_id, body: { number: selected.remote_jid.replace("@s.whatsapp.net", ""), audio: sendableUrl, encoding: true } } });
        if (pErr) toast.error(pErr.message);
      }
      setAudioBlob(null); setAudioPreviewUrl(null);
    } catch { toast.error("Error"); } finally { setUploadingMedia(false); }
  };

  /* ════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════ */

  return (
    <>
      <div className="-m-3 sm:-m-5 lg:-m-7 flex w-[calc(100%+1.5rem)] sm:w-[calc(100%+2.5rem)] lg:w-[calc(100%+3.5rem)] h-[calc(100%+1.5rem)] sm:h-[calc(100%+2.5rem)] lg:h-[calc(100%+3.5rem)] overflow-hidden gap-0 md:gap-0">

        {/* ═══════ LEFT: Conversation List ═══════ */}
        <div className={`w-full md:w-[340px] lg:w-[380px] flex-shrink-0 flex flex-col bg-card border-r border-border/10 overflow-hidden ${mobileShowChat ? "hidden md:flex" : "flex"}`}>

          {/* Header */}
          <div className="px-4 pt-5 pb-3 flex flex-col gap-3">
            {/* Filter tabs with count badges */}
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                {([
                  { key: "espera" as ChatFilter, label: "Novos", count: filterCounts.espera },
                  { key: "meus" as ChatFilter, label: "Meus", count: filterCounts.meus },
                  { key: "andamento" as ChatFilter, label: "Outros", count: filterCounts.andamento },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap ${
                      activeFilter === tab.key
                        ? "bg-foreground text-background shadow-md"
                        : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/30"
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={`inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[9px] font-bold leading-none ${
                        activeFilter === tab.key
                          ? "bg-background/20 text-background"
                          : "bg-muted/50 text-muted-foreground/50"
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Right actions: archive + menu */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => setActiveFilter("arquivadas")}
                  className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                    activeFilter === "arquivadas" ? "bg-primary/10 text-primary" : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/30"
                  }`}
                  title="Arquivadas"
                >
                  <CircleCheckBig className="h-4 w-4" strokeWidth={1.5} />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40">
                      <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem className="gap-2 text-[13px]" onSelect={() => setActiveFilter("todos")}>
                      <MessageSquare className="h-4 w-4" />
                      Todas conversas
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Search + filter icons */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/25" />
                <Input
                  placeholder={t("chat.searchPlaceholder")}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 text-[13px] rounded-full bg-muted/10 border-border/10 placeholder:text-muted-foreground/25 focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:bg-background transition-all"
                />
              </div>
              <TagFilterPopover selectedTagIds={selectedTagFilter} onToggleTag={handleToggleTagFilter}>
                <button className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted/30 transition-colors border border-border/10">
                  <Tag className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </TagFilterPopover>
            </div>

            {/* Active tag filters */}
            {selectedTagFilter.size > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {Array.from(selectedTagFilter).map(tagId => {
                  const tag = tags.find(t => t.id === tagId);
                  if (!tag) return null;
                  return <TagBadge key={tag.id} tag={tag} size="xs" onRemove={() => handleToggleTagFilter(tag.id)} />;
                })}
              </div>
            )}
          </div>

          {/* Conversation list */}
          <ScrollArea className="flex-1">
            <div className="px-2 pb-3">
              {isLoading ? (
                <div className="flex flex-col gap-1 px-2 pt-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3 items-center p-3 rounded-xl">
                      <div className="h-10 w-10 rounded-full bg-muted/30 animate-pulse flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted/30 rounded animate-pulse w-2/3" />
                        <div className="h-2.5 bg-muted/20 rounded animate-pulse w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-muted/20 border border-border/10 flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-muted-foreground/30" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm text-muted-foreground/30">{t("chat.noConversations")}</p>
                </div>
              ) : (
                groupedConversations.map(group => (
                  <div key={group.date}>
                    {group.convs.map((conv, i) => {
                      const agentName = conv.agent_id ? agentMap[conv.agent_id]?.name : null;
                      const ch = getChannelLogo(conv.remote_jid);
                      const isHuman = !conv.is_ai_active;

                      return (
                        <div key={conv.id}>
                          <button
                            onClick={() => handleSelect(conv.id)}
                            className={`w-full text-left flex items-center transition-all relative group/conv ${
                              settings.compact_mode ? "px-4 py-2.5 gap-2.5" : "px-4 py-3 gap-3"
                            } rounded-xl mx-1 ${
                              selectedId === conv.id
                                ? "bg-foreground/[0.04] shadow-sm"
                                : "hover:bg-muted/10"
                            }`}
                          >
                            {/* Avatar + channel logo + online dot */}
                            <div className="relative flex-shrink-0">
                              <Avatar name={conv.contact_name} pictureUrl={conv.profile_picture_url} size={settings.compact_mode ? 36 : 42} />
                              <img src={ch.src} alt={ch.alt} className={`absolute -bottom-0.5 -right-0.5 rounded-[4px] ring-[1.5px] ring-card object-contain ${ch.bg} ${
                                settings.compact_mode ? "h-3.5 w-3.5 p-[2px]" : "h-4 w-4 p-[2px]"
                              }`} />
                            </div>

                            {/* Center content */}
                            <div className="flex-1 min-w-0 overflow-hidden space-y-1">
                              {/* Row 1: Name + time */}
                              <div className="flex items-center justify-between gap-2">
                                <span className={`font-semibold truncate leading-tight min-w-0 flex-1 ${
                                  settings.compact_mode ? "text-[12px]" : "text-[13px]"
                                } ${selectedId === conv.id ? "text-foreground" : "text-foreground/85"}`}>
                                  {titleCase(conv.contact_name) || conv.contact_phone}
                                </span>
                                <span className="text-[10px] text-muted-foreground/35 tabular-nums whitespace-nowrap leading-none flex-shrink-0">
                                  {formatTime(conv.last_message_at)}
                                </span>
                              </div>

                              {/* Row 2: Preview + unread */}
                              {!settings.compact_mode && (
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11.5px] text-muted-foreground/40 truncate leading-snug flex-1 min-w-0">
                                    {(() => {
                                      if (!conv.last_message) return null;
                                      if (conv.last_message_media_type) {
                                        return (
                                          <span className="inline-flex items-center gap-1">
                                            {conv.last_message_media_type === "audio" ? <><Mic className="h-3 w-3 inline opacity-50" /> {t("chat.audio")}</> :
                                             conv.last_message_media_type === "image" ? <><Image className="h-3 w-3 inline opacity-50" /> {t("chat.image")}</> :
                                             conv.last_message_media_type === "video" ? <><Film className="h-3 w-3 inline opacity-50" /> {t("chat.video")}</> :
                                             conv.last_message}
                                          </span>
                                        );
                                      }
                                      return conv.last_message.length > 20 ? conv.last_message.slice(0, 20) + "..." : conv.last_message;
                                    })()}
                                  </p>
                                  {(conv.unread_count ?? 0) > 0 && (
                                    <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[9px] font-bold bg-accent text-accent-foreground leading-none flex-shrink-0">
                                      {conv.unread_count}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Row 3: Status + agent + tags */}
                              <div className="flex items-center gap-1.5 flex-wrap max-w-full">
                                {isHuman ? (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <UserCheck className="h-3 w-3 text-emerald-500/70" />
                                    <span className="text-[9px] text-muted-foreground/50 leading-none">Humano</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {conv.agent_id && agentMap[conv.agent_id]?.avatar_url ? (
                                      <img src={agentMap[conv.agent_id].avatar_url!} alt={agentName || "IA"} className="h-3.5 w-3.5 rounded-full object-cover" />
                                    ) : (
                                      <Bot className="h-3 w-3 text-blue-400/70" />
                                    )}
                                    <span className="text-[9px] text-muted-foreground/50 truncate leading-none max-w-[80px]">{agentName || "IA"}</span>
                                  </div>
                                )}
                                {getTagsForConversation(conv.id).length > 0 && (
                                  <div className="flex items-center gap-1 ml-auto flex-wrap flex-shrink-0 max-w-[60%]">
                                    {getTagsForConversation(conv.id).map(tag => (
                                      <span
                                        key={tag.id}
                                        className="text-[9px] font-semibold leading-none px-1.5 py-[2.5px] rounded-[3px] truncate max-w-[60px] text-white"
                                        style={{ backgroundColor: `${tag.color}` }}
                                      >
                                        {tag.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Compact mode: unread */}
                              {settings.compact_mode && (conv.unread_count ?? 0) > 0 && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-[16px] min-w-[16px] px-0.5 rounded-full text-[8px] font-bold bg-accent text-accent-foreground leading-none">
                                  {conv.unread_count}
                                </span>
                              )}
                            </div>
                          </button>
                          <div className="h-px bg-border/6 mx-4" />
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* ── New conversation bar ── */}
          <div className="border-t border-border/10 px-3 py-3 flex items-center gap-2 flex-shrink-0 bg-card/50">
            <select
              value={newConvCountry}
              onChange={e => setNewConvCountry(e.target.value)}
              className="h-8 px-1.5 rounded-lg bg-muted/30 border border-border/15 text-[11px] font-medium text-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30 flex-shrink-0"
            >
              <option value="+55">+55</option>
              <option value="+1">+1</option>
              <option value="+351">+351</option>
              <option value="+54">+54</option>
              <option value="+56">+56</option>
              <option value="+57">+57</option>
              <option value="+52">+52</option>
            </select>
            <Input
              value={newConvPhone}
              onChange={e => setNewConvPhone(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleStartConversation()}
              placeholder="(00)00000-0000"
              className="h-8 flex-1 min-w-0 text-[12px] bg-muted/20 border-border/15 placeholder:text-muted-foreground/30"
            />
            <Button
              size="sm"
              onClick={handleStartConversation}
              disabled={startingConv || !newConvPhone.replace(/\D/g, "")}
              className="h-8 px-3 text-[11px] font-semibold rounded-lg flex-shrink-0"
            >
              Conversar
            </Button>
          </div>
        </div>

        {/* ═══════ RIGHT: Chat Window ═══════ */}
        <div className={`flex-1 flex flex-col min-w-0 bg-background overflow-hidden ${!mobileShowChat ? "hidden md:flex" : "flex"}`}>
          {selected ? (
            <>
              {/* ── Chat Header ── */}
              <div className="px-4 sm:px-5 py-3.5 border-b border-border/10 flex items-center justify-between flex-shrink-0 bg-card/80 backdrop-blur-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden text-muted-foreground/60" onClick={() => setMobileShowChat(false)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Avatar name={selected.contact_name} pictureUrl={selected.profile_picture_url} size={38} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-tight truncate">{titleCase(selected.contact_name) || selected.contact_phone}</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {getTagsForConversation(selected.id).length > 0 ? (
                        getTagsForConversation(selected.id).map(tag => (
                          <span
                            key={tag.id}
                            className="text-[10px] font-semibold leading-none px-2 py-[3px] rounded-[3px] text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <p className="text-[11px] text-muted-foreground/40 truncate">
                          {selected.contact_phone || selected.remote_jid?.replace("@s.whatsapp.net", "").replace("telegram:", "+").replace("widget:", "")}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate("/crm")}
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/15 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/30 transition-colors"
                  >
                    <Kanban className="h-3 w-3" strokeWidth={1.5} />
                    Funil de vendas
                  </button>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <TagAssignPopover conversationId={selected.id}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/30 hover:text-foreground/60" title="Tags">
                      <Tag className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </TagAssignPopover>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/30 hover:text-foreground/60" onClick={() => setShowDetailPanel(p => !p)}>
                    <PanelRightOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/30 hover:text-foreground/60">
                        <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem className="gap-2 text-[13px]" onSelect={handleToggleAi}>
                        <RotateCcw className="h-4 w-4" />
                        Voltar para Agente
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-[13px]" onSelect={() => setShowTransferModal(true)}>
                        <ArrowRightLeft className="h-4 w-4" />
                        Transferir atendimento
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-[13px] text-emerald-500 focus:text-emerald-500" onSelect={async (e) => {
                        e.preventDefault();
                        if (!selected) return;
                        try {
                          await supabase.from("conversations").update({ is_resolved: true } as any).eq("id", selected.id);
                          toast.success("Conversa marcada como resolvida");
                          setSelectedId(null);
                        } catch { toast.error("Erro ao resolver conversa"); }
                      }}>
                        <CircleCheckBig className="h-4 w-4" />
                        Marcar como resolvido
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 text-[13px]" onSelect={async (e) => {
                        e.preventDefault();
                        if (!selected) return;
                        const ok = confirm("Tem certeza que deseja limpar todas as mensagens desta conversa?");
                        if (!ok) return;
                        try {
                          await supabase.from("messages").delete().eq("conversation_id", selected.id);
                          await supabase.from("conversations").update({ last_message: null, last_message_at: null, last_message_sender: null, last_message_media_type: null, unread_count: 0 } as any).eq("id", selected.id);
                          toast.success("Mensagens limpas");
                        } catch { toast.error("Erro ao limpar mensagens"); }
                      }}>
                        <Eraser className="h-4 w-4" />
                        Limpar mensagens
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 text-[13px]" onSelect={async (e) => {
                        e.preventDefault();
                        if (!selected) return;
                        try {
                          const isBlocked = (selected as any).is_blocked;
                          await supabase.from("conversations").update({ is_blocked: !isBlocked } as any).eq("id", selected.id);
                          toast.success(isBlocked ? "Contato desbloqueado" : "Contato bloqueado");
                        } catch { toast.error("Erro ao atualizar contato"); }
                      }}>
                        <Ban className="h-4 w-4" />
                        {(selected as any)?.is_blocked ? "Desbloquear contato" : "Bloquear contato"}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onSelect={async (e) => {
                        e.preventDefault();
                        if (!selected) return;
                        const ok = confirm("Tem certeza que deseja apagar esta conversa? Todas as mensagens serão excluídas.");
                        if (!ok) return;
                        try {
                          await supabase.from("contact_notes" as any).delete().eq("conversation_id", selected.id);
                          await supabase.from("messages").delete().eq("conversation_id", selected.id);
                          await supabase.from("conversations").delete().eq("id", selected.id);
                          setSelectedId(null);
                          setMobileShowChat(false);
                          toast.success("Conversa apagada");
                        } catch { toast.error("Erro ao apagar conversa"); }
                      }}>
                        <Trash2 className="h-4 w-4" />
                        Apagar conversa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* AI Banner */}
              {selected.is_ai_active ? (
                <div className="mx-4 sm:mx-6 mt-3 flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary/5 border border-primary/10">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary/60" />
                  </div>
                  <p className="text-[13px] text-muted-foreground font-medium">Esta conversa está sendo controlada por um agente automatizado</p>
                </div>
              ) : null}

              {/* ── Messages Area ── */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="px-4 sm:px-6 lg:px-10 py-5 space-y-4">
                  {(() => {
                    let lastDate = "";
                    return messages.map(msg => {
                      const date = formatDateGroup(msg.timestamp);
                      const showDate = date !== lastDate;
                      lastDate = date;
                      const agentInfo = selected.agent_id ? agentMap[selected.agent_id] : null;
                      const senderName = msg.sender === "user"
                        ? (titleCase(selected.contact_name) || selected.contact_phone || "")
                        : msg.sender === "agent" ? (agentInfo?.name || t("chat.agentAi")) : t("chat.human");
                      const isOutgoing = msg.sender !== "user";
                      const time = new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      const fullDate = new Date(msg.timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });

                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div className="flex justify-center my-6">
                              <span className="text-[11px] text-muted-foreground/30 font-medium px-3 py-1 rounded-full bg-muted/20 border border-border/8">
                                {date}
                              </span>
                            </div>
                          )}
                          <div className={`flex items-end gap-2.5 ${isOutgoing ? "justify-end" : "justify-start"}`}>
                            {!isOutgoing && (
                              <div className="flex-shrink-0 mb-5">
                                <Avatar name={selected.contact_name} pictureUrl={selected.profile_picture_url} size={32} />
                              </div>
                            )}
                            <div className={`max-w-[70%] sm:max-w-[60%] flex flex-col ${isOutgoing ? "items-end" : "items-start"}`}>
                              <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                                isOutgoing
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-card border border-border/10 text-foreground rounded-bl-md"
                              }`}>
                                {/* Media */}
                                {msg.media_type && (
                                  <ChatMediaContent
                                    mediaUrl={msg.media_url}
                                    mediaType={msg.media_type}
                                    sender={msg.sender}
                                    onImageClick={(url) => { setLightboxUrl(url); setLightboxZoom(1); }}
                                    t={t}
                                  />
                                )}
                                {msg.content && !isMediaPlaceholder(msg.content, msg.media_type) && (
                                  <p className={`text-[13.5px] leading-relaxed whitespace-pre-wrap ${isOutgoing ? "text-primary-foreground/95" : "text-foreground/80"}`}>
                                    {msg.content.split(/(\*[^*]+\*)/).map((part, pi) =>
                                      part.startsWith("*") && part.endsWith("*") && part.length > 2
                                        ? <strong key={pi}>{part.slice(1, -1)}</strong>
                                        : part
                                    )}
                                  </p>
                                )}
                              </div>
                              <span className="text-[10px] mt-1 px-1 tabular-nums text-muted-foreground/25">
                                {time}
                              </span>
                            </div>
                            {isOutgoing && (
                              <div className="flex-shrink-0 mb-5">
                                {(() => {
                                  if (msg.sender === "agent") {
                                    const agentInfo = selected.agent_id ? agentMap[selected.agent_id] : null;
                                    return <Avatar name={agentInfo?.name || "Bot"} pictureUrl={agentInfo?.avatar_url || null} size={32} />;
                                  }
                                  // Human sender - use member profile
                                  const member = memberMap[msg.user_id];
                                  return <Avatar name={member?.display_name || "Atendente"} pictureUrl={member?.avatar_url || null} size={32} />;
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* ── Input Area ── */}
              <div className="px-4 sm:px-6 py-3.5 border-t border-border/10 flex-shrink-0 bg-card/80 backdrop-blur-sm">
                <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />

                {/* Media / Audio previews */}
                <AnimatePresence>
                  {mediaPreview && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="mb-3 flex items-start gap-3 p-3 rounded-2xl bg-muted/20 border border-border/15">
                      {mediaPreview.type === "image" ? <img src={mediaPreview.url} alt="" className="h-16 w-16 object-cover rounded-xl flex-shrink-0" /> : mediaPreview.type === "video" ? <video src={mediaPreview.url} className="h-16 w-16 object-cover rounded-xl flex-shrink-0" /> : <div className="h-16 w-16 rounded-xl bg-muted/50 flex items-center justify-center"><FileText className="h-6 w-6 text-muted-foreground/50" /></div>}
                      <div className="flex-1 min-w-0 py-1">
                        <p className="text-[12px] font-medium truncate">{mediaPreview.file.name}</p>
                        <p className="text-[11px] text-muted-foreground/40 mt-0.5">{mediaPreview.type === "image" ? `📷 ${t("chat.image")}` : mediaPreview.type === "video" ? `🎥 ${t("chat.video")}` : `📄 ${t("chat.document")}`}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={handleSendMedia} disabled={uploadingMedia} className="h-8 w-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setMediaPreview(null)} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted/50"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </motion.div>
                  )}
                  {audioPreviewUrl && !isRecording && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="mb-3 flex items-center gap-3 p-3 rounded-2xl bg-muted/20 border border-border/15">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><Mic className="h-3.5 w-3.5 text-primary/70" /></div>
                      <audio src={audioPreviewUrl} controls className="flex-1 h-7 min-w-0" />
                      <div className="flex items-center gap-1">
                        <button onClick={handleSendAudio} disabled={uploadingMedia} className="h-8 w-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { setAudioBlob(null); setAudioPreviewUrl(null); }} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted/50"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main input */}
                {isRecording ? (
                  <div className="flex items-center gap-3 bg-destructive/5 border border-destructive/20 rounded-xl px-5 py-2.5">
                    <div className="flex items-center gap-2.5 flex-1">
                      <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-destructive opacity-75" /><span className="relative rounded-full h-2 w-2 bg-destructive" /></span>
                      <span className="text-[13px] text-destructive font-mono tabular-nums font-medium">{formatRecordingTime(recordingSeconds)}</span>
                      <span className="text-[12px] text-muted-foreground/40">{t("chat.recordingAudio")}</span>
                    </div>
                    <button onClick={cancelRecording} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted/50"><X className="h-3.5 w-3.5" /></button>
                    <button onClick={stopRecording} className="h-9 w-9 rounded-full flex items-center justify-center bg-destructive text-white"><Square className="h-3 w-3 fill-current" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {/* Input field */}
                    <div className="flex-1 flex items-center gap-1 bg-muted/8 border border-border/10 rounded-2xl px-2 py-1.5 focus-within:border-primary/20 focus-within:bg-background focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.06)] transition-all relative">
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={() => setShowEmojiPicker(v => !v)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground/35 hover:text-muted-foreground/70 hover:bg-muted/40 transition-all"
                        >
                          <Smile className="h-[18px] w-[18px]" strokeWidth={1.5} />
                        </button>
                        {showEmojiPicker && (
                          <div className="absolute bottom-10 left-0 z-50">
                            <Picker
                              data={data}
                              onEmojiSelect={(emoji: any) => {
                                setNewMessage(prev => prev + emoji.native);
                                setShowEmojiPicker(false);
                              }}
                              theme="dark"
                              locale="pt"
                              previewPosition="none"
                              skinTonePosition="none"
                            />
                          </div>
                        )}
                      </div>
                      <input
                        placeholder={selected.is_ai_active ? "Assuma a conversa para digitar..." : t("chat.typeMessage")}
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSend()}
                        disabled={selected.is_ai_active}
                        className={`flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/25 outline-none h-9 px-2 ${selected.is_ai_active ? "cursor-not-allowed opacity-40" : ""}`}
                      />
                      <button onClick={() => fileInputRef.current?.click()} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground/35 hover:text-muted-foreground/70 hover:bg-muted/40 transition-all flex-shrink-0">
                        <Plus className="h-[18px] w-[18px]" strokeWidth={1.5} />
                      </button>
                    </div>
                    {/* Sign name toggle - hidden when AI is active */}
                    {!selected.is_ai_active && (
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              const next = !signName;
                              setSignName(next);
                              localStorage.setItem("chat-sign-name", String(next));
                            }}
                            className={`flex items-center justify-center h-7 w-7 rounded-md transition-all flex-shrink-0 ${signName ? "text-accent/60 hover:text-accent" : "text-muted-foreground/20 hover:text-muted-foreground/40"}`}
                          >
                            <span className={`flex items-center justify-center h-3 w-3 rounded-[2px] border transition-colors ${signName ? "bg-accent/70 border-accent/70" : "border-muted-foreground/25"}`}>
                              {signName && (
                                <svg viewBox="0 0 12 12" className="h-2 w-2 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2.5 6L5 8.5L9.5 3.5" />
                                </svg>
                              )}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {signName ? "Enviando com seu nome" : "Clique para assinar mensagens com seu nome"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Assumir controle button - only when AI is active */}
                    {selected.is_ai_active && (
                      <button
                        onClick={handleToggleAi}
                        className="flex items-center px-2.5 h-7 rounded-md text-[11px] font-medium transition-all flex-shrink-0 whitespace-nowrap text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40"
                      >
                        Assumir
                      </button>
                    )}
                    {/* Mic / Send button */}
                    <AnimatePresence mode="wait">
                      {newMessage.trim() ? (
                        <motion.button key="send" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} onClick={handleSend} className="h-10 flex items-center gap-1.5 px-5 rounded-full bg-primary text-primary-foreground font-semibold text-[12px] hover:brightness-110 transition-all flex-shrink-0 shadow-md shadow-primary/20">
                          Enviar <Send className="h-3.5 w-3.5" />
                        </motion.button>
                      ) : (
                        <motion.button key="mic" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} onClick={startRecording} className="h-10 w-10 rounded-full flex items-center justify-center bg-muted/20 text-muted-foreground/50 hover:bg-muted/40 transition-all flex-shrink-0">
                          <Mic className="h-[17px] w-[17px]" strokeWidth={1.6} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Empty State ── */
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
              <div className="flex flex-col items-center gap-6">
                <motion.div
                  className="relative"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center">
                    <Bot className="h-10 w-10 text-primary/30" strokeWidth={1.2} />
                  </div>
                </motion.div>
                <motion.div
                  className="text-center max-w-sm"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                >
                  <h3 className="text-lg font-bold text-foreground/80 mb-2">Moderação de atendimentos</h3>
                  <p className="text-[13px] text-muted-foreground/40 leading-relaxed">
                    Monitore em tempo real as respostas que seus agentes estão enviando aos seus clientes, assuma a conversa se necessário, ou aguarde um agente solicitar sua ajuda.
                  </p>
                </motion.div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════ RIGHT PANEL: Contact Details (always visible on xl) ═══════ */}
        {selected && (
          <div className={`${showDetailPanel ? "flex" : "hidden"} flex-shrink-0`}>
            <ContactDetailPanel
              conversation={selected as any}
              onClose={() => setShowDetailPanel(false)}
            />
          </div>
        )}
      </div>

      {/* ═══════ Lightbox ═══════ */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <button onClick={e => { e.stopPropagation(); setLightboxZoom(z => Math.max(0.5, z - 0.25)); }} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ZoomOut className="h-5 w-5" /></button>
              <button onClick={e => { e.stopPropagation(); setLightboxZoom(z => Math.min(3, z + 0.25)); }} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ZoomIn className="h-5 w-5" /></button>
              <a href={lightboxUrl} download target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><Download className="h-5 w-5" /></a>
              <button onClick={() => setLightboxUrl(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><X className="h-5 w-5" /></button>
            </div>
            <motion.img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" style={{ transform: `scale(${lightboxZoom})` }} onClick={e => e.stopPropagation()} initial={{ scale: 0.8 }} animate={{ scale: lightboxZoom }} transition={{ type: "spring", stiffness: 300, damping: 25 }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ Transfer Modal ═══════ */}
      <Dialog open={showTransferModal} onOpenChange={(open) => { setShowTransferModal(open); if (!open) { setTransferTargetId(""); setTransferSearch(""); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Transferir atendimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-[13px] text-muted-foreground flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-muted-foreground/30 text-[10px]">i</span>
              Você está transferindo o atendimento, selecione abaixo se deseja enviar a um agente ou um membro humano da equipe.
            </p>

            <div className="space-y-1.5">
              <label className="text-[13px] text-muted-foreground">Enviar o atendimento para um:</label>
              <select
                value={transferType}
                onChange={e => { setTransferType(e.target.value as "agent" | "human"); setTransferTargetId(""); setTransferSearch(""); }}
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="agent">um agente</option>
                <option value="human">um humano</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-[13px] font-medium text-foreground">Selecione</span>
                </div>
                <div className="px-3 py-2 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <input
                      value={transferSearch}
                      onChange={e => setTransferSearch(e.target.value)}
                      placeholder="Busque por nome..."
                      className="text-[13px] bg-transparent outline-none w-full placeholder:text-muted-foreground/40"
                    />
                  </div>
                </div>
                <div className="max-h-[260px] overflow-y-auto">
                  {(() => {
                    const search = transferSearch.toLowerCase();
                    const agentItems = (agents || [])
                      .filter(a => a.id !== selected?.agent_id && a.name.toLowerCase().includes(search))
                      .map(a => ({ id: a.id, type: "agent" as const, name: a.name, subtitle: "Agente de IA", avatar_url: a.avatar_url, email: null as string | null }));
                    const humanItems = (orgMembers || [])
                      .filter(m => {
                        const s = search;
                        return m.display_name.toLowerCase().includes(s) || (m.email && m.email.toLowerCase().includes(s));
                      })
                      .map(m => ({ id: m.user_id, type: "human" as const, name: m.display_name, subtitle: m.role === "owner" ? "Proprietário" : m.role === "admin" ? "Admin" : "Membro", avatar_url: m.avatar_url, email: m.email }));
                    const items = transferType === "agent" ? agentItems : transferType === "human" ? humanItems : [...humanItems, ...agentItems];
                    if (items.length === 0) return <div className="px-3 py-4 text-center text-[13px] text-muted-foreground">Nenhum resultado encontrado</div>;
                    return items.map(item => (
                      <button
                        key={`${item.type}-${item.id}`}
                        onClick={() => { setTransferTargetId(item.id); setTransferType(item.type); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-muted/50 ${transferTargetId === item.id ? "bg-primary/10" : ""}`}
                      >
                        {item.avatar_url ? (
                          <img src={item.avatar_url} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            {item.type === "agent" ? <Bot className="h-4 w-4 text-muted-foreground" /> : <User className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate">{item.name}</div>
                          <div className="text-[11px] text-muted-foreground">{item.subtitle}</div>
                          {item.email && <div className="text-[10px] text-muted-foreground/70 truncate">{item.email}</div>}
                        </div>
                        {transferTargetId === item.id && <CheckCheck className="h-4 w-4 text-primary flex-shrink-0" />}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            </div>

            <Button
              className="w-full h-11 text-[14px] font-semibold"
              disabled={!transferTargetId}
              onClick={async () => {
                if (!selected || !transferTargetId) return;
                try {
                  if (transferType === "agent") {
                    await supabase.from("conversations").update({ agent_id: transferTargetId, is_ai_active: true } as any).eq("id", selected.id);
                    const agentName = agents?.find(a => a.id === transferTargetId)?.name || "agente";
                    toast.success(`Transferido para ${agentName}`);
                  } else {
                    await supabase.from("conversations").update({ assigned_to: transferTargetId, is_ai_active: false } as any).eq("id", selected.id);
                    const memberName = orgMembers?.find(m => m.user_id === transferTargetId)?.display_name || "membro";
                    // Send notification to the target member
                    const senderName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Alguém";
                    const contactLabel = titleCase(selected.contact_name) || selected.contact_phone || selected.remote_jid;
                    await supabase.from("notifications" as any).insert({
                      user_id: transferTargetId,
                      type: "transfer",
                      title: "Atendimento transferido para você",
                      message: `${senderName} transferiu o atendimento de ${contactLabel} para você.`,
                      metadata: { conversation_id: selected.id, from_user_id: user?.id },
                    });
                    toast.success(`Transferido para ${memberName}`);
                  }
                  setShowTransferModal(false);
                  setTransferTargetId("");
                  setTransferSearch("");
                } catch { toast.error("Erro ao transferir atendimento"); }
              }}
            >
              FAZER TRANSFERÊNCIA
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
