import { motion } from "framer-motion";
import { Trophy, Award, Medal, Coins } from "lucide-react";
import { customIcons } from "@/assets/custom-icons";
import { ThemedIcon } from "@/components/ui/themed-icon";

import whatsappLogo from "@/assets/whatsapp-logo.webp";
import telegramLogo from "@/assets/telegram-logo.png";
import webchatLogo from "@/assets/webchat-logo.png";

import openaiLogo from "@/assets/providers/openai.svg";
import anthropicLogo from "@/assets/providers/anthropic.svg";
import googleLogo from "@/assets/providers/google.png";
import deepseekLogo from "@/assets/providers/deepseek.png";
import grokLogo from "@/assets/providers/grok.png";
import groqLogo from "@/assets/providers/groq.webp";
import mistralLogo from "@/assets/providers/mistral.png";

const channelLogos: Record<string, string> = {
  whatsapp: whatsappLogo,
  telegram: telegramLogo,
  widget: webchatLogo,
};

const providerLogos: Record<string, string> = {
  openai: openaiLogo,
  anthropic: anthropicLogo,
  google: googleLogo,
  deepseek: deepseekLogo,
  grok: grokLogo,
  groq: groqLogo,
  mistral: mistralLogo,
};

function getProviderFromModel(model: string | null): string | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes("gpt") || m.includes("openai") || m.includes("o1") || m.includes("o3") || m.includes("o4")) return "openai";
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gemini") || m.includes("google")) return "google";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("grok")) return "grok";
  if (m.includes("groq") || m.includes("llama") || m.includes("mixtral")) return "groq";
  if (m.includes("mistral")) return "mistral";
  return null;
}

export interface TopAgentItem {
  name: string;
  metric: string;
  metricLabel: string;
  avatarUrl?: string | null;
  credits?: number;
  model?: string | null;
  channels?: string[];
}

export function TopAgentsCard({ items, title, subtitle }: { items: TopAgentItem[]; title?: string; subtitle?: string }) {
  const accent = "hsl(var(--accent))";
  return (
    <div className="stat-card relative overflow-hidden">
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-28 w-28 rounded-full blur-3xl opacity-25"
        style={{ background: accent }}
      />
      <div className="relative p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="icon-container icon-container-sm shrink-0">
              <ThemedIcon src={customIcons.iconDevice} alt="Agentes" className="h-[18px] w-[18px] opacity-95" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">{title || "Top Agentes"}</p>
              <p className="text-[11px] text-muted-foreground/85 mt-0.5">{subtitle || "Mensagens respondidas"}</p>
            </div>
          </div>
        </div>
        <div>
          {items.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground/60">—</div>
          ) : (
            items.slice(0, 5).map((item, i) => {
              const RankIcon = i === 0 ? Trophy : i === 1 ? Award : Medal;
              const provider = getProviderFromModel(item.model);
              const providerLogo = provider ? providerLogos[provider] : null;
              const channels = item.channels || [];

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                  className="flex items-center gap-3 py-3.5 border-b border-border/8 last:border-b-0"
                >
                  <span className="text-[11px] text-muted-foreground/75 w-4 text-center font-bold tabular-nums">{i + 1}</span>
                  <RankIcon className={`h-4 w-4 shrink-0 ${i === 0 ? "text-amber-500" : i === 1 ? "text-muted-foreground/60" : "text-orange-400"}`} />
                  <div className="relative shrink-0">
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-muted-foreground/60">{(item.name || "?").slice(0, 2).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{item.name || "---"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground/85">{item.metricLabel}: {item.metric}</span>
                      {(item.credits ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-500/70">
                          <Coins className="h-3 w-3" strokeWidth={1.5} />
                          {item.credits}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {channels.map((ch) => {
                      const logo = channelLogos[ch];
                      return logo ? (
                        <img key={ch} src={logo} alt="" className="h-4 w-4 rounded-full object-contain opacity-50" />
                      ) : null;
                    })}
                  </div>
                  {providerLogo && (
                    <img src={providerLogo} alt="" className="h-4 w-4 rounded object-contain shrink-0 opacity-50" />
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
