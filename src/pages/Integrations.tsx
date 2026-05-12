import { useState, useMemo, useEffect } from "react";
import { GoogleCalendarWizard } from "@/components/GoogleCalendarWizard";
import { Plus, Plug, Loader2, QrCode, RefreshCw, LogOut, Trash2, Signal, Send, Globe, Copy, Check, X, ArrowLeft, MoreVertical, Zap, Wifi, Search, User, Lock, Bot } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { useEvolutionApi, useEvolutionInstance, type EvolutionConnection } from "@/hooks/useEvolutionApi";
import { useTelegramConnections, type TelegramConnection } from "@/hooks/useTelegramConnections";
import { useWidgetConnections, type WidgetConnection } from "@/hooks/useWidgetConnections";
import { useAgents, useUpdateAgent, type Agent } from "@/hooks/useAgents";
import { useLanguage } from "@/hooks/useLanguage";
import { usePlanLimits } from "@/hooks/usePlan";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import whatsappLogo from "@/assets/whatsapp-logo.webp";
import telegramLogo from "@/assets/telegram-logo.png";
import webchatLogo from "@/assets/webchat-logo.png";
import mercadolivreLogo from "@/assets/mercadolivre-logo.svg";
import instagramLogo from "@/assets/instagram-logo.png";
import facebookLogo from "@/assets/facebook-logo.png";

type AgentInfo = { name: string; avatar_url: string | null } | null;

function displayName(raw: string | null): string {
  if (!raw) return "default";
  return raw.replace(/-[a-f0-9]{12,16}$/, "") || raw;
}

function StatusBadge({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[12px] font-medium ${connected ? "text-primary" : "text-muted-foreground/40"}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        {connected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? "bg-primary" : "bg-muted-foreground/25"}`} />
      </span>
      {label}
    </div>
  );
}

function AgentCell({ agent }: { agent: AgentInfo }) {
  if (!agent) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground/40">
        <User className="h-4 w-4" strokeWidth={1.5} />
        <span>Sem agente</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarImage src={agent.avatar_url ?? undefined} alt={agent.name} />
        <AvatarFallback className="text-[10px] bg-secondary text-muted-foreground">
          {agent.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-[12px] font-medium truncate text-foreground">{agent.name}</span>
    </div>
  );
}

function WhatsAppRow({ conn, onDelete, agent }: { conn: EvolutionConnection; onDelete: () => void; agent: AgentInfo }) {
  const { t } = useLanguage();
  const { profile, qrCode, qrLoading, fetchQr, checkStatus, logout, restart } = useEvolutionInstance(conn.id);
  const [showQr, setShowQr] = useState(false);

  // Auto-hide QR when connected
  useEffect(() => {
    if (conn.is_connected && showQr) setShowQr(false);
  }, [conn.is_connected]);

  const handleConnectClick = () => {
    setShowQr(v => !v);
    if (!showQr) fetchQr();
  };

  return (
    <>
      <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_48px] px-5 py-3.5 items-center hover:bg-secondary/10 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <img src={whatsappLogo} alt="WhatsApp" className="h-8 w-8 object-contain shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate leading-tight">
              {displayName(conn.phone_number) || "WhatsApp"}
            </p>
            <p className="text-[11px] text-muted-foreground/35">{t("integrations.evolutionInstance")}</p>
          </div>
        </div>
        <AgentCell agent={agent} />
        <p className="text-[12px] text-muted-foreground/50 truncate font-mono">
          {conn.is_connected && profile?.owner ? `+${profile.owner}` : displayName(conn.phone_number) || t("integrations.notDefined")}
        </p>
        <StatusBadge connected={conn.is_connected} label={conn.is_connected ? t("integrations.connected") : t("integrations.disconnected")} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {!conn.is_connected && (
              <DropdownMenuItem onClick={handleConnectClick} className="gap-2.5 font-medium text-primary focus:text-primary">
                <QrCode className="h-3.5 w-3.5" /> {t("integrations.connectQr")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => checkStatus.mutate()} className="gap-2.5">
              <Wifi className="h-3.5 w-3.5" /> {t("integrations.checkStatus")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => restart.mutate()} className="gap-2.5">
              <RefreshCw className="h-3.5 w-3.5" /> {t("integrations.restart")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => logout.mutate()} className="gap-2.5">
              <LogOut className="h-3.5 w-3.5" /> {t("integrations.disconnect")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="gap-2.5 text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> {t("integrations.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* QR Code panel */}
      <AnimatePresence>
        {showQr && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-border/10">
            <div className="px-5 py-4 flex items-center gap-6 bg-secondary/5">
              <div className="flex flex-col items-center gap-2">
                {qrLoading ? (
                  <div className="h-36 w-36 rounded-xl border border-border/20 bg-background/40 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
                  </div>
                ) : qrCode ? (
                  <img src={`data:image/png;base64,${qrCode}`} className="h-36 w-36 rounded-xl border border-border/20" />
                ) : (
                  <div className="h-36 w-36 rounded-xl border border-border/20 bg-background/40 flex items-center justify-center">
                    <QrCode className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <Button size="sm" variant="ghost" onClick={fetchQr} disabled={qrLoading} className="gap-1.5 text-[11px] h-7 text-muted-foreground/60 hover:text-foreground">
                  {qrLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} {t("integrations.updateQr")}
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-[13px] font-semibold">{t("integrations.scanQr")}</p>
                <ol className="space-y-1.5">
                  {[t("integrations.qr.step1"), t("integrations.qr.step2"), t("integrations.qr.step3"), t("integrations.qr.step4")].map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground/60">
                      <span className="shrink-0 h-4 w-4 rounded-full bg-primary/15 text-primary text-[10px] flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function TelegramRow({ conn, onDelete, onConnectToken, agent }: {
  conn: TelegramConnection;
  onDelete: () => void;
  onConnectToken: (id: string, token: string) => void;
  agent: AgentInfo;
}) {
  const { t } = useLanguage();
  const [showWebhook, setShowWebhook] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [connectPending, setConnectPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<"idle" | "success" | "error">("idle");

  const projectId = "jxnadbeodkozvgmzuvnm";
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/telegram-webhook?token=${conn.bot_token}`;

  const handleCopy = () => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handleConnectToken = async () => {
    if (!tokenInput.trim()) return;
    setConnectPending(true);
    try {
      onConnectToken(conn.id, tokenInput.trim());
      setTimeout(() => {}, 200);
      setTokenInput("");
      setShowConnect(false);
    } finally {
      setConnectPending(false);
    }
  };

  const handleRegisterWebhook = async () => {
    setRegistering(true); setRegisterStatus("idle");
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${supabaseUrl}/functions/v1/telegram-webhook?action=register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": anonKey },
        body: JSON.stringify({ botToken: conn.bot_token, connectionId: conn.id }),
      });
      const json = await resp.json();
      setRegisterStatus(json.ok ? "success" : "error");
      setTimeout(() => setRegisterStatus("idle"), 4000);
    } catch { setRegisterStatus("error"); setTimeout(() => setRegisterStatus("idle"), 4000); }
    finally { setRegistering(false); }
  };

  return (
    <>
      <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_48px] px-5 py-3.5 items-center hover:bg-secondary/10 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <img src={telegramLogo} alt="Telegram" className="h-8 w-8 object-contain shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate leading-tight">{conn.bot_name || "Telegram Bot"}</p>
            <p className="text-[11px] text-muted-foreground/35">{t("integrations.telegramBot")}</p>
          </div>
        </div>
        <AgentCell agent={agent} />
        <p className={`text-[12px] truncate font-mono ${conn.bot_username ? "text-primary/70" : "text-muted-foreground/40"}`}>
          {conn.bot_username ? `@${conn.bot_username}` : t("integrations.notDefined")}
        </p>
        <StatusBadge connected={conn.is_connected} label={conn.is_connected ? t("integrations.connected") : t("integrations.disconnected")} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {!conn.is_connected && (
              <DropdownMenuItem onClick={() => { setShowConnect(v => !v); setShowWebhook(false); }} className="gap-2.5 font-medium text-primary focus:text-primary">
                <Send className="h-3.5 w-3.5" /> {t("integrations.connectBot")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => { setShowWebhook(v => !v); setShowConnect(false); }} className="gap-2.5">
              <Globe className="h-3.5 w-3.5" /> {t("integrations.webhook")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="gap-2.5 text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> {t("integrations.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AnimatePresence>
        {showConnect && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-border/10">
            <div className="px-5 py-4 space-y-3 bg-secondary/5">
              <p className="text-[13px] font-semibold">{t("integrations.insertToken")}</p>
              <p className="text-[12px] text-muted-foreground/50">{t("integrations.getToken")}</p>
              <div className="flex gap-2">
                <input value={tokenInput} onChange={e => setTokenInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleConnectToken()} placeholder="123456789:AAF..." autoFocus className="flex-1 h-9 rounded-lg border border-border/30 bg-background/60 px-3 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                <Button size="sm" onClick={handleConnectToken} disabled={connectPending || !tokenInput.trim()} className="gap-1.5 h-9">
                  {connectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {t("integrations.connect")}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {conn.is_connected && !conn.webhook_url && (
        <div className="px-5 py-2.5 flex items-center justify-between gap-3 border-t border-amber-500/15" style={{ background: 'rgba(245,158,11,0.04)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-400/90">{t("integrations.webhookNotActive")}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={handleRegisterWebhook} disabled={registering}
            className="shrink-0 h-7 gap-1 text-[11px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20">
            {registering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} {t("integrations.activateNow")}
          </Button>
        </div>
      )}
      <AnimatePresence>
        {showWebhook && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden border-t border-border/10">
            <div className="px-5 py-4 space-y-3 bg-secondary/5">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/20 bg-background/40">
                <div>
                  <p className="text-[12px] font-semibold">{t("integrations.registerWebhook")}</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">{t("integrations.registerWebhookDesc")}</p>
                </div>
                <Button size="sm" onClick={handleRegisterWebhook} disabled={registering}
                  className={`shrink-0 gap-1.5 text-xs h-8 ${registerStatus === "success" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : registerStatus === "error" ? "bg-destructive/10 text-destructive border border-destructive/30" : ""}`}
                  variant={registerStatus === "idle" ? "default" : "ghost"}>
                  {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : registerStatus === "success" ? <><Check className="h-3.5 w-3.5" /> {t("integrations.activated")}</> : registerStatus === "error" ? <><X className="h-3.5 w-3.5" /> {t("integrations.error")}</> : <><Zap className="h-3.5 w-3.5" /> {t("integrations.activate")}</>}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[10px] bg-background/60 border border-border/30 rounded-lg px-3 py-2 truncate font-mono text-muted-foreground/70">{webhookUrl}</code>
                <Button size="sm" variant="ghost" onClick={handleCopy} className="shrink-0 h-8 w-8 p-0">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function WidgetRow({ conn, onDelete, agent }: { conn: WidgetConnection; onDelete: () => void; agent: AgentInfo }) {
  const { t } = useLanguage();
  const [showCode, setShowCode] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const projectUrl = window.location.origin;
  const iframeCode = `<iframe\n  src="${projectUrl}/widget/${conn.id}/iframe"\n  width="100%"\n  style="height: 100%; min-height: 700px"\n  allow="microphone;"\n  frameborder="0">\n</iframe>`;
  const scriptCode = `<script\n  async\n  src="${projectUrl}/widget/${conn.id}/float.js">\n</script>`;

  const handleCopyIframe = () => { navigator.clipboard.writeText(iframeCode); setCopiedIframe(true); setTimeout(() => setCopiedIframe(false), 2000); };
  const handleCopyScript = () => { navigator.clipboard.writeText(scriptCode); setCopiedScript(true); setTimeout(() => setCopiedScript(false), 2000); };

  return (
    <>
      <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_48px] px-5 py-3.5 items-center hover:bg-secondary/10 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <img src={webchatLogo} alt="Webchat" className="h-8 w-8 object-contain shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold truncate leading-tight">{conn.name}</p>
            <p className="text-[11px] text-muted-foreground/35">{t("integrations.webWidget")}</p>
          </div>
        </div>
        <AgentCell agent={agent} />
        <p className="text-[12px] text-muted-foreground/40 font-mono truncate">{conn.id.slice(0, 12)}…</p>
        <StatusBadge connected={conn.is_active} label={conn.is_active ? t("integrations.active") : t("integrations.inactive")} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setShowCode(v => !v)} className="gap-2.5">
              <Globe className="h-3.5 w-3.5" /> {showCode ? t("integrations.hideCode") : t("integrations.showCode")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="gap-2.5 text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> {t("integrations.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AnimatePresence>
        {showCode && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden border-t border-border/10">
            <div className="px-5 py-5 space-y-5">
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-foreground/80">{t("integrations.embedIframe")}</p>
                <p className="text-[12px] text-muted-foreground/50">{t("integrations.embedIframeDesc")}</p>
                <div className="relative">
                  <pre className="bg-secondary/20 border border-border/20 rounded-xl p-4 text-[11px] font-mono text-primary/80 overflow-x-auto leading-relaxed whitespace-pre">{iframeCode}</pre>
                  <button onClick={handleCopyIframe} className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/30 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    {copiedIframe ? <><Check className="h-3 w-3 text-emerald-400" /> {t("integrations.copied")}</> : <><Copy className="h-3 w-3" /> {t("integrations.copy")}</>}
                  </button>
                </div>
              </div>
              <div className="h-px bg-border/15" />
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-foreground/80">{t("integrations.floatingButton")}</p>
                <p className="text-[12px] text-muted-foreground/50">{t("integrations.floatingButtonDesc")}</p>
                <div className="relative">
                  <pre className="bg-secondary/20 border border-border/20 rounded-xl p-4 text-[11px] font-mono text-primary/80 overflow-x-auto leading-relaxed whitespace-pre">{scriptCode}</pre>
                  <button onClick={handleCopyScript} className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/30 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    {copiedScript ? <><Check className="h-3 w-3 text-emerald-400" /> {t("integrations.copied")}</> : <><Copy className="h-3 w-3" /> {t("integrations.copy")}</>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Integrations() {
  const { t } = useLanguage();
  const { connections, isLoading, saveConfig, deleteConfig } = useEvolutionApi();
  const { connections: telegramConns, isLoading: tgLoading, createNamed: createTgNamed, connectToken: connectTgToken, deleteConnection: deleteTg } = useTelegramConnections();
  const { connections: widgetConns, isLoading: wgLoading, addConnection: addWidget, deleteConnection: deleteWidget } = useWidgetConnections();
  const { data: agents = [] } = useAgents();
  const updateAgent = useUpdateAgent();
  const { canCreateConnection, maxConnections, currentConnections } = usePlanLimits();

  const [modalOpen, setModalOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState("");
  const [botDisplayName, setBotDisplayName] = useState("");
  const [widgetName, setWidgetName] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [gcalWizardOpen, setGcalWizardOpen] = useState(false);

  // Auto-open Google Calendar wizard after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal") === "connected") {
      setGcalWizardOpen(true);
    }
  }, []);

  // Build agent lookup maps
  const agentByConnectionId = useMemo(() => {
    const map = new Map<string, AgentInfo>();
    agents.forEach(a => {
      if (a.connection_id) map.set(a.connection_id, { name: a.name, avatar_url: a.avatar_url });
      if (a.telegram_connection_id) map.set(a.telegram_connection_id, { name: a.name, avatar_url: a.avatar_url });
    });
    return map;
  }, [agents]);

  // Widget agents: match by widget_connections.agent_id
  const agentById = useMemo(() => {
    const map = new Map<string, AgentInfo>();
    agents.forEach(a => map.set(a.id, { name: a.name, avatar_url: a.avatar_url }));
    return map;
  }, [agents]);

  const getAgentForWidget = (conn: WidgetConnection): AgentInfo => {
    if ((conn as any).agent_id) return agentById.get((conn as any).agent_id) || null;
    return null;
  };

  // Filter logic
  const filteredWhatsApp = useMemo(() => {
    return connections.filter(c => {
      const name = displayName(c.phone_number) || "WhatsApp";
      const agent = agentByConnectionId.get(c.id);
      if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (agentFilter !== "all") {
        if (agentFilter === "none" && agent) return false;
        if (agentFilter !== "none" && agent?.name !== agentFilter) return false;
      }
      return true;
    });
  }, [connections, searchQuery, agentFilter, agentByConnectionId]);

  const filteredTelegram = useMemo(() => {
    return telegramConns.filter(c => {
      const name = c.bot_name || "Telegram Bot";
      const agent = agentByConnectionId.get(c.id);
      if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (agentFilter !== "all") {
        if (agentFilter === "none" && agent) return false;
        if (agentFilter !== "none" && agent?.name !== agentFilter) return false;
      }
      return true;
    });
  }, [telegramConns, searchQuery, agentFilter, agentByConnectionId]);

  const filteredWidgets = useMemo(() => {
    return widgetConns.filter(c => {
      const name = c.name;
      const agent = getAgentForWidget(c);
      if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (agentFilter !== "all") {
        if (agentFilter === "none" && agent) return false;
        if (agentFilter !== "none" && agent?.name !== agentFilter) return false;
      }
      return true;
    });
  }, [widgetConns, searchQuery, agentFilter, agentById]);

  const CHANNELS = [
    { key: "whatsapp", label: "WhatsApp", description: t("integrations.wa.desc"), logo: whatsappLogo, steps: [t("integrations.wa.step1"), t("integrations.wa.step2"), t("integrations.wa.step3"), t("integrations.wa.step4")] },
    { key: "telegram", label: "Telegram", description: t("integrations.tg.desc"), logo: telegramLogo, steps: [t("integrations.tg.step1"), t("integrations.tg.step2"), t("integrations.tg.step3")] },
    { key: "widget", label: "Chat Web", description: t("integrations.wg.desc"), logo: webchatLogo, steps: [t("integrations.wg.step1"), t("integrations.wg.step2"), t("integrations.wg.step3"), t("integrations.wg.step4")] },
  ];

  const COMING_SOON = [
    { label: "Mercado Livre", description: t("integrations.cs.mercadolivre"), logo: mercadolivreLogo },
    { label: "Instagram", description: t("integrations.cs.instagram"), logo: instagramLogo },
    { label: "Facebook", description: t("integrations.cs.facebook"), logo: facebookLogo },
  ];

  const handleConnectWhatsApp = () => {
    const base = instanceName.trim().replace(/[^a-zA-Z0-9_-]/g, "") || "default";
    const hash = Math.random().toString(16).slice(2, 18);
    saveConfig.mutate({ instanceName: `${base}-${hash}` }, {
      onSuccess: (data: any) => {
        // Assign agent to this connection
        const connId = data?.data?.id;
        if (selectedAgentId && connId) {
          updateAgent.mutate({ id: selectedAgentId, connection_id: connId });
        }
        setInstanceName(""); setSelectedAgentId(""); setModalOpen(false); setActiveChannel(null);
      },
    });
  };

  const handleConnectTelegram = () => {
    const name = botDisplayName.trim() || "Meu Bot";
    createTgNamed.mutate(name, {
      onSuccess: (data: any) => {
        if (selectedAgentId && data?.id) {
          updateAgent.mutate({ id: selectedAgentId, telegram_connection_id: data.id });
        }
        setBotDisplayName(""); setSelectedAgentId(""); setModalOpen(false); setActiveChannel(null);
      },
    });
  };

  const handleCreateWidget = () => {
    addWidget.mutate({ name: widgetName.trim() || "Meu Widget", agent_id: selectedAgentId }, {
      onSuccess: () => { setWidgetName(""); setSelectedAgentId(""); setModalOpen(false); setActiveChannel(null); },
    });
  };



  const openModal = () => {
    if (!canCreateConnection) {
      toast.error(`${t("billing.limitReached")}: ${currentConnections}/${maxConnections} ${t("billing.connections")}. ${t("billing.upgradePlan")}`);
      return;
    }
    setActiveChannel(null);
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setActiveChannel(null); setSelectedAgentId(""); };

  const totalCount = connections.length + telegramConns.length + widgetConns.length;
  const filteredCount = filteredWhatsApp.length + filteredTelegram.length + filteredWidgets.length;
  const hasAny = totalCount > 0;
  const channelInfo = CHANNELS.find(c => c.key === activeChannel);

  // Unique agent names for filter
  const uniqueAgentNames = useMemo(() => {
    const names = new Set<string>();
    agents.forEach(a => names.add(a.name));
    return Array.from(names).sort();
  }, [agents]);

  return (
    <PageTransition>
      <div className="space-y-10">
        <motion.div
          className="flex items-center justify-between page-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight">{t("integrations.title")}</h1>
            <p className="text-[13px] text-muted-foreground/40 mt-1.5">{t("integrations.subtitle")}</p>
          </div>
          <Button size="sm" onClick={openModal} className="gap-2.5 h-11 px-6 rounded-2xl bg-foreground text-background hover:bg-foreground/90 shadow-none text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-foreground/5">
            <Plus className="h-4 w-4" /> {t("integrations.newChannel")}
          </Button>
        </motion.div>

        <Dialog open={modalOpen} onOpenChange={closeModal}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden border-border/30 shadow-2xl" style={{ background: 'hsl(var(--card))' }}>
            <AnimatePresence mode="wait">
              {!activeChannel && (
                <motion.div key="pick" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.18 }}>
                  <div className="px-7 pt-7 pb-5 border-b border-border/20">
                    <p className="text-[17px] font-bold">{t("integrations.whichChannel")}</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">{t("integrations.chooseChannel")}</p>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-3">
                      {CHANNELS.map(ch => (
                        <button key={ch.key} onClick={() => setActiveChannel(ch.key)}
                          className="relative flex flex-col items-center gap-3 p-5 rounded-2xl border border-border/25 bg-secondary/10 hover:bg-secondary/25 hover:border-border/50 transition-all group text-center">
                          <span className="absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">{t("integrations.free")}</span>
                          <img src={ch.logo} alt={ch.label} className="h-14 w-14 object-contain" />
                          <div>
                            <p className="text-[13px] font-semibold leading-tight">{ch.label}</p>
                            <p className="text-[11px] text-muted-foreground/50 leading-snug mt-1">{ch.description}</p>
                          </div>
                          <span className="mt-auto w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-border/30 bg-secondary/30 text-muted-foreground/70 group-hover:bg-secondary/60 group-hover:text-foreground/80 transition-colors">
                            {t("integrations.connectFree")}
                          </span>
                        </button>
                      ))}
                      {COMING_SOON.map(ch => (
                        <div key={ch.label} className="relative flex flex-col items-center gap-3 p-5 rounded-2xl border border-border/15 bg-secondary/5 text-center opacity-60 cursor-not-allowed select-none">
                          <span className="absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground/60 border border-border/20">{t("integrations.comingSoon")}</span>
                          <img src={ch.logo} alt={ch.label} className="h-14 w-14 object-contain grayscale" />
                          <div>
                            <p className="text-[13px] font-semibold leading-tight">{ch.label}</p>
                            <p className="text-[11px] text-muted-foreground/40 leading-snug mt-1">{ch.description}</p>
                          </div>
                          <span className="mt-auto w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-border/20 bg-secondary/20 text-muted-foreground/30">{t("integrations.comingSoon")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeChannel && channelInfo && (
                <motion.div key={activeChannel} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
                  <div className="px-6 pt-6 pb-5 flex items-center gap-4">
                    <button onClick={() => setActiveChannel(null)} className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground/40 hover:text-foreground/70 hover:bg-secondary/40 transition-colors shrink-0">
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <img src={channelInfo.logo} alt={channelInfo.label} className="h-10 w-10 object-contain rounded-xl shrink-0" />
                    <div>
                      <p className="text-[15px] font-bold leading-tight">{channelInfo.label}</p>
                      <p className="text-[12px] text-muted-foreground/50 mt-0.5">{channelInfo.description}</p>
                    </div>
                  </div>
                  <div className="px-6 pb-6 space-y-5">
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-muted-foreground/35 uppercase tracking-widest">{t("integrations.stepByStep")}</p>
                      <div className="space-y-2.5">
                        {channelInfo.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border border-border/30" style={{ background: 'hsl(var(--secondary) / 0.5)' }}>
                              <span className="text-[10px] font-bold text-foreground/50">{i + 1}</span>
                            </div>
                            <p className="text-[13px] text-muted-foreground/65 leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="h-px bg-border/15" />

                    {/* Agent selector - required for all channels */}
                    <div className="space-y-2">
                      <Label className="text-[12px] font-semibold text-foreground/70 flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5" />
                        {t("integrations.responsibleAgent") || "Agente Responsável"}
                      </Label>
                      <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                        <SelectTrigger className="h-10 text-sm border-border/30" style={{ background: 'hsl(var(--secondary) / 0.15)' }}>
                          <SelectValue placeholder={t("integrations.selectAgent") || "Selecione um agente (opcional)"} />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.length === 0 ? (
                            <div className="px-3 py-4 text-center">
                              <p className="text-[12px] text-muted-foreground/60">{t("integrations.noAgentsCreated") || "Nenhum agente criado"}</p>
                              <p className="text-[11px] text-muted-foreground/40 mt-1">{t("integrations.createAgentFirst") || "Crie um agente antes de adicionar um canal"}</p>
                            </div>
                          ) : (
                            agents.map(a => (
                              <SelectItem key={a.id} value={a.id}>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-5 w-5 shrink-0">
                                    <AvatarImage src={a.avatar_url ?? undefined} />
                                    <AvatarFallback className="text-[9px] bg-secondary">{a.name.charAt(0).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <span>{a.name}</span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {activeChannel === "whatsapp" && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[12px] font-semibold text-foreground/70">{t("integrations.instanceName")}</Label>
                          <Input value={instanceName} onChange={e => setInstanceName(e.target.value)} placeholder="minha-empresa" className="h-10 text-sm border-border/30" style={{ background: 'hsl(var(--secondary) / 0.15)' }} onKeyDown={e => e.key === "Enter" && handleConnectWhatsApp()} />
                        </div>
                        <div className="flex gap-2.5">
                          <Button onClick={handleConnectWhatsApp} disabled={saveConfig.isPending || !selectedAgentId} className="gap-2 font-semibold">
                            {saveConfig.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t("integrations.createInstance")}
                          </Button>
                          <Button variant="ghost" onClick={closeModal} className="text-muted-foreground/60">{t("common.cancel")}</Button>
                        </div>
                      </div>
                    )}

                    {activeChannel === "telegram" && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[12px] font-semibold text-foreground/70">{t("integrations.channelName")}</Label>
                          <Input value={botDisplayName} onChange={e => setBotDisplayName(e.target.value)} placeholder="Ex: Suporte Telegram" className="h-10 text-sm border-border/30" style={{ background: 'hsl(var(--secondary) / 0.15)' }} onKeyDown={e => e.key === "Enter" && handleConnectTelegram()} autoFocus />
                          <p className="text-[11px] text-muted-foreground/50">{t("integrations.afterClickConnect")}</p>
                        </div>
                        <div className="flex gap-2.5">
                          <Button onClick={handleConnectTelegram} disabled={createTgNamed.isPending || !selectedAgentId} className="gap-2 font-semibold">
                            {createTgNamed.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {t("integrations.createChannel")}
                          </Button>
                          <Button variant="ghost" onClick={closeModal} className="text-muted-foreground/60">{t("common.cancel")}</Button>
                        </div>
                      </div>
                    )}

                    {activeChannel === "widget" && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[12px] font-semibold text-foreground/70">{t("integrations.widgetName")}</Label>
                          <Input value={widgetName} onChange={e => setWidgetName(e.target.value)} placeholder="Chat do Meu Site" className="h-10 text-sm border-border/30" style={{ background: 'hsl(var(--secondary) / 0.15)' }} onKeyDown={e => e.key === "Enter" && handleCreateWidget()} autoFocus />
                          <p className="text-[11px] text-muted-foreground/50">{t("integrations.afterClickConfigure")}</p>
                        </div>
                        <div className="flex gap-2.5">
                          <Button onClick={handleCreateWidget} disabled={addWidget.isPending || !selectedAgentId} className="gap-2 font-semibold">
                            {addWidget.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />} {t("integrations.createWidget")}
                          </Button>
                          <Button variant="ghost" onClick={closeModal} className="text-muted-foreground/60">{t("common.cancel")}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </DialogContent>
        </Dialog>

        {(isLoading || tgLoading || wgLoading) && !hasAny && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !tgLoading && !wgLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
          <Card className="border border-border/15 rounded-3xl shadow-none overflow-hidden">
            <div className="px-6 py-3.5 border-b border-border/10 flex items-center justify-between gap-4 flex-wrap">
              <span className="text-[12px] text-muted-foreground/40">
                {hasAny ? `${t("integrations.showing")} 1 a ${filteredCount} ${t("integrations.of")} ${totalCount} ${t("integrations.channels")}` : t("integrations.noChannelConfigured")}
              </span>
              <div className="flex items-center gap-3 ml-auto">
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="h-9 w-44 text-xs border-border/15 rounded-xl bg-muted/20">
                    <User className="h-3.5 w-3.5 mr-1.5 text-muted-foreground/40" />
                    <SelectValue placeholder="Todos agentes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos agentes</SelectItem>
                    <SelectItem value="none">Sem agente</SelectItem>
                    {uniqueAgentNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nome ou telefone..."
                    className="h-9 w-56 pl-9 text-xs border-border/15 rounded-xl bg-muted/20"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_48px] px-6 py-2.5 border-b border-border/8 bg-muted/10">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">{t("integrations.name")}</span>
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">{t("integrations.agent")}</span>
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">{t("integrations.identifier")}</span>
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">{t("integrations.status")}</span>
              <span />
            </div>

            {!hasAny ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <div className="flex items-center gap-2">
                  {[whatsappLogo, telegramLogo, webchatLogo].map((logo, i) => (
                    <div key={i} className="h-10 w-10 rounded-xl bg-secondary/20 border border-border/15 flex items-center justify-center">
                      <img src={logo} className="h-6 w-6 object-contain opacity-30" />
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground/40">{t("integrations.noChannels")}</p>
                <Button size="sm" onClick={openModal} className="gap-1.5 mt-1">
                  <Plus className="h-3.5 w-3.5" /> {t("integrations.addChannel")}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/10">
                {filteredWhatsApp.map(conn => (
                  <WhatsAppRow key={conn.id} conn={conn} onDelete={() => deleteConfig.mutate(conn.id)} agent={agentByConnectionId.get(conn.id) || null} />
                ))}
                {filteredTelegram.map(conn => (
                  <TelegramRow key={conn.id} conn={conn}
                    onDelete={() => deleteTg.mutate(conn.id)}
                    onConnectToken={(id, token) => connectTgToken.mutate({ id, botToken: token })}
                    agent={agentByConnectionId.get(conn.id) || null}
                  />
                ))}
                {filteredWidgets.map(conn => (
                  <WidgetRow key={conn.id} conn={conn} onDelete={() => deleteWidget.mutate(conn.id)} agent={getAgentForWidget(conn)} />
                ))}
                {filteredCount === 0 && (
                  <div className="flex items-center justify-center py-10">
                    <p className="text-sm text-muted-foreground/40">Nenhum canal encontrado</p>
                  </div>
                )}
              </div>
            )}
          </Card>
          </motion.div>
        )}

      </div>
      <GoogleCalendarWizard open={gcalWizardOpen} onOpenChange={setGcalWizardOpen} />
    </PageTransition>
  );
}
