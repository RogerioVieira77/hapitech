import { WifiOff, RefreshCw, Clock, CheckCircle, AlertCircle, History } from "lucide-react";
import { useConnectionEvents, formatDuration, type ConnectionEvent } from "@/hooks/useConnectionEvents";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import telegramLogo from "@/assets/telegram-logo.png";
import whatsappLogo from "@/assets/whatsapp-logo.webp";

function EventRow({ event, index }: { event: ConnectionEvent; index: number }) {
  const { t } = useLanguage();
  const isTelegram = event.connection_type === "telegram";
  const isOpen = !event.reconnected_at;

  const disconnectedDate = new Date(event.disconnected_at);
  const reconnectedDate = event.reconnected_at ? new Date(event.reconnected_at) : null;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formatDate = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-5 py-3.5 items-center hover:bg-secondary/10 transition-colors text-[12px]"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: isTelegram ? "rgba(36,161,222,0.12)" : "rgba(37,211,102,0.1)" }}>
          <img src={isTelegram ? telegramLogo : whatsappLogo} className="h-4 w-4 object-contain" />
        </div>
        <span className="font-medium text-foreground/80 truncate">
          {event.channel_name || (isTelegram ? "Bot Telegram" : "WhatsApp")}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-foreground/70">{formatTime(disconnectedDate)}</span>
        <span className="text-muted-foreground/40 text-[10px]">{formatDate(disconnectedDate)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {reconnectedDate ? (
          <>
            <span className="font-mono text-foreground/70">{formatTime(reconnectedDate)}</span>
            <span className="text-muted-foreground/40 text-[10px]">{formatDate(reconnectedDate)}</span>
          </>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </div>
      <div>
        {isOpen ? (
          <span className="text-destructive/70 font-medium animate-pulse">{t("events.ongoing")}</span>
        ) : (
          <span className="font-mono text-foreground/60">{formatDuration(event.duration_seconds)}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {isOpen ? (
          <>
            <WifiOff className="h-3.5 w-3.5 text-destructive" strokeWidth={1.5} />
            <span className="text-destructive font-medium">Offline</span>
          </>
        ) : (
          <>
            <CheckCircle className="h-3.5 w-3.5 text-green-500" strokeWidth={1.5} />
            <span className="text-green-500 font-medium">{t("events.resolved")}</span>
          </>
        )}
      </div>
    </motion.div>
  );
}

export function ConnectionEventHistory() {
  const { t } = useLanguage();
  const { data: events = [], isLoading } = useConnectionEvents(100);
  const openIncidents = events.filter(e => !e.reconnected_at).length;

  return (
    <div className="rounded-2xl border border-border/20 overflow-hidden bg-card">
      <div className="px-5 py-4 border-b border-border/15 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-foreground/80">{t("events.title")}</span>
          {openIncidents > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
              {openIncidents} {t("events.offline")}
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground/40">
          {events.length === 0 ? t("events.noIncidents") : `${events.length} ${events.length !== 1 ? t("events.events") : t("events.event")}`}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/30" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-secondary/30">
            <CheckCircle className="h-5 w-5 text-green-500 opacity-60" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-muted-foreground/40">{t("events.noIncidentDetected")}</p>
          <p className="text-[11px] text-muted-foreground/30">{t("events.incidentWillAppear")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-5 py-2.5 border-b border-border/10 bg-secondary/5">
            <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">{t("events.channel")}</span>
            <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">{t("events.disconnectedAt")}</span>
            <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">{t("events.reconnectedAt")}</span>
            <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">{t("events.duration")}</span>
            <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">{t("events.statusLabel")}</span>
          </div>
          <div className="divide-y divide-border/10 max-h-80 overflow-y-auto">
            {events.map((event, i) => (
              <EventRow key={event.id} event={event} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
