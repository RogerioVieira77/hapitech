import { useState, useRef, useEffect } from "react";
import { Send, RotateCcw, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

interface Props {
  agentId: string;
  instructions: string;
  model: string;
  temperature: number;
  starters: string[];
}

// clinicorp-query handles both plain chat and Clinicorp tool-calling in one endpoint
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clinicorp-query`;

export function AgentChat({ agentId, instructions, model, temperature, starters }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      // Use the user's JWT so the edge function can validate credits properly
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Get MCP server URLs from localStorage
      let mcpServers: { name: string; server_url: string }[] = [];
      try {
        const raw = localStorage.getItem("mcp_connections_local");
        if (raw) {
          const all = JSON.parse(raw) as Array<{ is_connected?: boolean; server_url?: string; name?: string }>;
          mcpServers = all
            .filter((c) => c.is_connected && c.server_url)
            .map((c) => ({ name: c.name || "", server_url: c.server_url || "" }));
        }
      } catch { /* ignore */ }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMessages,
          instructions,
          model,
          temperature,
          agent_id: agentId,
          user_id: user?.id,
          mcp_servers: mcpServers.length > 0 ? mcpServers : undefined,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro na resposta" }));
        toast.error(err.error || `Erro ${resp.status}`);
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
    } catch (e) {
      console.error(e);
      toast.error("Erro ao conectar com o agente");
    }
    setIsLoading(false);
  };

  const reset = () => {
    setMessages([]);
    setInput("");
  };

  return (
    <div className="flex flex-col flex-1">
      <ScrollArea className="flex-1 px-5 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[340px] text-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/60 border border-border/40">
              <Bot className="h-6 w-6 text-foreground/60" />
            </div>
            <p className="text-sm text-muted-foreground">Teste seu agente enviando uma mensagem</p>
            {starters.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {starters.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="rounded-full bg-secondary/60 px-3.5 py-1.5 text-xs text-foreground/80 hover:bg-secondary/80 hover:text-foreground transition-colors border border-border/30"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 mb-5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/60 border border-border/30 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-foreground/60" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-foreground text-background"
                : "bg-secondary/50 text-foreground border border-border/30"
            }`}>
              {msg.content}
              {msg.role === "assistant" && isLoading && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-4 bg-foreground/40 ml-0.5 animate-pulse rounded-sm" />
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/60 border border-border/30 mt-0.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border/30 px-5 py-4 flex gap-2.5">
        {messages.length > 0 && (
          <Button variant="ghost" size="icon" onClick={reset} className="shrink-0 text-muted-foreground hover:text-foreground" title="Reiniciar">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send(input)}
          placeholder="Digite uma mensagem..."
          className="bg-background/50 border-border/40"
          disabled={isLoading}
        />
        <Button
          size="icon"
          onClick={() => send(input)}
          disabled={isLoading || !input.trim()}
          className="shrink-0 bg-foreground text-background hover:bg-foreground/90"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
