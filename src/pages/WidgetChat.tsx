import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Send, RotateCcw, Bot, User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

interface WidgetConfig {
  id: string;
  name: string;
  primary_color: string | null;
  welcome_message: string | null;
  is_active: boolean;
}

const WIDGET_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/widget-chat`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function WidgetChat() {
  const { id } = useParams<{ id: string }>();
  const [widget, setWidget] = useState<WidgetConfig | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch widget config (public, no auth)
  useEffect(() => {
    if (!id) return;
    supabase
      .from("widget_connections")
      .select("id, name, primary_color, welcome_message, is_active")
      .eq("id", id)
      .eq("is_active", true)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setWidget(data);
        }
        setConfigLoading(false);
      });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const primaryColor = widget?.primary_color || "#6366f1";

  const send = async (text: string) => {
    if (!text.trim() || isLoading || !id) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    let assistantSoFar = "";

    try {
      const resp = await fetch(WIDGET_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": ANON_KEY,
        },
        body: JSON.stringify({ widgetId: id, messages: newMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro na resposta" }));
        setMessages(prev => [...prev, { role: "assistant", content: err.error || "Ocorreu um erro. Tente novamente." }]);
        setIsLoading(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch { /* partial json */ }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Ocorreu um erro ao conectar. Tente novamente." }]);
    }
    setIsLoading(false);
    inputRef.current?.focus();
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (configLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#6366f1" }} />
      </div>
    );
  }

  // ─── Not found / inactive ─────────────────────────────────────────────────
  if (notFound || !widget) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white gap-3 px-6 text-center">
        <div className="h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: "#f3f4f6" }}>
          <Bot className="h-7 w-7" style={{ color: "#9ca3af" }} />
        </div>
        <p className="text-[15px] font-semibold text-gray-700">Chat indisponível</p>
        <p className="text-[13px] text-gray-400">Este widget não está ativo ou não foi encontrado.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#ffffff" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 shadow-sm" style={{ background: primaryColor }}>
        <div className="h-8 w-8 rounded-full flex items-center justify-center bg-white/20">
          <Bot className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-white leading-tight truncate">{widget.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-300" />
            <span className="text-[11px] text-white/70">Online</span>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="ml-auto flex items-center gap-1 text-[11px] text-white/60 hover:text-white/90 transition-colors"
            title="Reiniciar conversa"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ background: "#f9fafb" }}>
        {/* Welcome message */}
        {messages.length === 0 && widget.welcome_message && (
          <div className="flex gap-2.5 items-end">
            <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: primaryColor + "20", border: `1px solid ${primaryColor}30` }}>
              <Bot className="h-3.5 w-3.5" style={{ color: primaryColor }} />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-[13px] leading-relaxed text-gray-700 shadow-sm" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
              {widget.welcome_message}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 items-end ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: primaryColor + "20", border: `1px solid ${primaryColor}30` }}>
                <Bot className="h-3.5 w-3.5" style={{ color: primaryColor }} />
              </div>
            )}
            <div
              className="max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm"
              style={
                msg.role === "user"
                  ? { background: primaryColor, color: "#ffffff", borderBottomRightRadius: "4px" }
                  : { background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderBottomLeftRadius: "4px" }
              }
            >
              {msg.content}
              {msg.role === "assistant" && isLoading && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-3.5 ml-1 animate-pulse rounded-sm" style={{ background: primaryColor + "60" }} />
              )}
            </div>
            {msg.role === "user" && (
              <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center bg-gray-200">
                <User className="h-3.5 w-3.5 text-gray-500" />
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-2.5 items-end">
            <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: primaryColor + "20" }}>
              <Bot className="h-3.5 w-3.5" style={{ color: primaryColor }} />
            </div>
            <div className="rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
              <div className="flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: primaryColor, animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: primaryColor, animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: primaryColor, animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 py-3 border-t bg-white" style={{ borderColor: "#e5e7eb" }}>
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#f3f4f6", border: "1px solid #e5e7eb" }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
            placeholder="Digite uma mensagem..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-[13px] text-gray-700 placeholder-gray-400 outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={isLoading || !input.trim()}
            className="h-7 w-7 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-40"
            style={{ background: primaryColor }}
          >
            <Send className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
        <p className="text-center text-[10px] mt-1.5" style={{ color: "#d1d5db" }}>Powered by IA</p>
      </div>
    </div>
  );
}
