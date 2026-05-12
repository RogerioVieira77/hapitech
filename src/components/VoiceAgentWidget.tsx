import { useConversation } from "@elevenlabs/react";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Phone, PhoneOff, Loader2, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGoogleCalendarConnections } from "@/hooks/useGoogleCalendar";
import { toast } from "sonner";

export function VoiceAgentWidget() {
  const { user, session } = useAuth();
  const { connections } = useGoogleCalendarConnections();
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);

  const getActiveConnectionId = () => connections?.[0]?.id || null;

  const conversation = useConversation({
    clientTools: {
      check_availability: async (params: { date: string }) => {
        const connectionId = getActiveConnectionId();
        if (!connectionId) return "Nenhuma agenda conectada. Peça ao usuário para conectar o Google Calendar.";

        try {
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-availability`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ date: params.date, connection_id: connectionId }),
            }
          );
          const data = await resp.json();
          if (!resp.ok) return `Erro ao consultar: ${data.error}`;

          if (data.available_slots?.length === 0) {
            return `Não há horários disponíveis em ${data.date}.`;
          }

          const slotsText = data.available_slots
            .map((s: any) => {
              const start = new Date(s.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              const end = new Date(s.end).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              return `${start} - ${end}`;
            })
            .join(", ");

          return `Horários disponíveis em ${data.date}: ${slotsText}`;
        } catch (err: any) {
          return `Erro ao consultar disponibilidade: ${err.message}`;
        }
      },

      schedule_meeting: async (params: {
        date: string;
        start_time: string;
        end_time: string;
        summary: string;
        attendee_name?: string;
        attendee_email?: string;
        description?: string;
      }) => {
        const connectionId = getActiveConnectionId();
        if (!connectionId) return "Nenhuma agenda conectada.";

        try {
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-create-event`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({
                connection_id: connectionId,
                summary: params.summary,
                description: params.description || "",
                start_time: params.start_time,
                end_time: params.end_time,
                attendee_email: params.attendee_email,
                attendee_name: params.attendee_name,
              }),
            }
          );
          const data = await resp.json();
          if (!resp.ok) return `Erro ao agendar: ${data.error}`;

          let result = `Reunião "${params.summary}" agendada com sucesso!`;
          if (data.meet_link) result += ` Link do Google Meet: ${data.meet_link}`;
          return result;
        } catch (err: any) {
          return `Erro ao agendar: ${err.message}`;
        }
      },
    },
    onConnect: () => {
      console.log("ElevenLabs agent connected");
    },
    onDisconnect: () => {
      console.log("ElevenLabs agent disconnected");
    },
    onMessage: (message) => {
      setTranscript((prev) => [
        ...prev,
        { role: message.role === "user" ? "user" : "agent", text: message.message },
      ]);
    },
    onError: (error) => {
      console.error("ElevenLabs error:", error);
      toast.error("Erro na conexão com o agente de voz");
    },
  });

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    setTranscript([]);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const { data, error } = await supabase.functions.invoke(
        "elevenlabs-conversation-token"
      );

      if (error || !data?.signed_url) {
        throw new Error("Não foi possível obter token de conversação");
      }

      await conversation.startSession({
        signedUrl: data.signed_url,
      });
    } catch (error: any) {
      console.error("Failed to start:", error);
      toast.error(error.message || "Erro ao iniciar conversa");
    } finally {
      setIsConnecting(false);
    }
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Orb visual */}
      <div className="relative">
        <motion.div
          className={`h-32 w-32 rounded-full flex items-center justify-center transition-colors ${
            isConnected
              ? isSpeaking
                ? "bg-primary/20 shadow-[0_0_60px_rgba(var(--primary),0.3)]"
                : "bg-primary/10"
              : "bg-muted/20"
          }`}
          animate={
            isConnected && isSpeaking
              ? { scale: [1, 1.08, 1], transition: { repeat: Infinity, duration: 1.2 } }
              : { scale: 1 }
          }
        >
          <motion.div
            className={`h-20 w-20 rounded-full flex items-center justify-center ${
              isConnected
                ? isSpeaking
                  ? "bg-primary/30"
                  : "bg-primary/15"
                : "bg-muted/10"
            }`}
            animate={
              isConnected && isSpeaking
                ? { scale: [1, 1.12, 1], transition: { repeat: Infinity, duration: 0.8 } }
                : { scale: 1 }
            }
          >
            {isConnected ? (
              isSpeaking ? (
                <Volume2 className="h-8 w-8 text-primary" />
              ) : (
                <Mic className="h-8 w-8 text-primary animate-pulse" />
              )
            ) : (
              <MicOff className="h-8 w-8 text-muted-foreground/40" />
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* Status */}
      <div className="text-center">
        <p className="text-sm font-semibold">
          {isConnecting
            ? "Conectando..."
            : isConnected
            ? isSpeaking
              ? "Agente falando..."
              : "Ouvindo você..."
            : "Clique para iniciar"}
        </p>
        <p className="text-xs text-muted-foreground/50 mt-1">
          {isConnected ? "Google Calendar integrado" : "Agente de voz com agendamento"}
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        {!isConnected ? (
          <Button
            onClick={startConversation}
            disabled={isConnecting}
            className="gap-2 bg-primary hover:bg-primary/90 rounded-full px-8 h-12"
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            {isConnecting ? "Conectando..." : "Iniciar conversa"}
          </Button>
        ) : (
          <Button
            onClick={stopConversation}
            variant="destructive"
            className="gap-2 rounded-full px-8 h-12"
          >
            <PhoneOff className="h-4 w-4" />
            Encerrar
          </Button>
        )}
      </div>

      {/* Transcript */}
      <AnimatePresence>
        {transcript.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="w-full max-w-md mt-2"
          >
            <div className="rounded-xl border border-border/20 bg-secondary/5 p-4 max-h-[200px] overflow-y-auto space-y-2">
              {transcript.map((t, i) => (
                <div key={i} className={`text-xs ${t.role === "user" ? "text-muted-foreground/70" : "text-foreground font-medium"}`}>
                  <span className="text-[10px] text-muted-foreground/40 mr-1">
                    {t.role === "user" ? "Você:" : "Agente:"}
                  </span>
                  {t.text}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
