import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Check, Coins, Loader2, Zap, Brain, MessageSquare, Search, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import openaiLogo from "@/assets/providers/openai.svg";
import anthropicLogo from "@/assets/providers/anthropic.svg";
import googleLogo from "@/assets/providers/google.png";
import deepseekLogo from "@/assets/providers/deepseek.png";
import grokLogo from "@/assets/providers/grok.png";
import groqLogo from "@/assets/providers/groq.webp";
import mistralLogo from "@/assets/providers/mistral.png";

interface AiModelRow {
  id: string;
  model_id: string;
  display_name: string;
  provider_id: string;
  credits_per_response: number;
}

interface Provider {
  id: string;
  name: string;
  display_name: string;
}

const PROVIDER_META: Record<string, { logo: string; logoBg: string; logoFilter?: string }> = {
  openai:    { logo: openaiLogo,    logoBg: "bg-black",      logoFilter: "invert" },
  anthropic: { logo: anthropicLogo, logoBg: "bg-[#cc785c]" },
  google:    { logo: googleLogo,    logoBg: "bg-white" },
  deepseek:  { logo: deepseekLogo,  logoBg: "bg-white" },
  grok:      { logo: grokLogo,      logoBg: "bg-white" },
  groq:      { logo: groqLogo,      logoBg: "bg-white" },
  mistral:   { logo: mistralLogo,   logoBg: "bg-white" },
};

const CONTEXT_MULTIPLIERS = [
  { value: 1, label: "1×", messages: 20,  tokens: "3k" },
  { value: 2, label: "2×", messages: 40,  tokens: "6k" },
  { value: 3, label: "3×", messages: 60,  tokens: "9k" },
  { value: 4, label: "4×", messages: 80,  tokens: "12k" },
  { value: 5, label: "5×", messages: 100, tokens: "15k" },
];

function creditTier(credits: number) {
  if (credits >= 20) return { cls: "bg-secondary/40 text-muted-foreground border border-border/30", label: "Ultra" };
  if (credits >= 5)  return { cls: "bg-secondary/40 text-muted-foreground border border-border/30", label: "Premium" };
  if (credits >= 3)  return { cls: "bg-secondary/40 text-muted-foreground border border-border/30", label: "Plus" };
  return { cls: "bg-secondary/40 text-muted-foreground border border-border/30", label: "Eco" };
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentModel: string;
  onSave: (model: string, contextMultiplier: number) => void;
}

export function ModelSelectorModal({ open, onClose, currentModel, onSave }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<AiModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(currentModel);
  const [contextMultiplier, setContextMultiplier] = useState(1);
  const [modelSearch, setModelSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setModelSearch("");
    Promise.all([
      supabase.from("ai_providers_public" as any).select("id, name, display_name").order("name"),
      supabase.from("ai_models" as any).select("id, model_id, display_name, provider_id, credits_per_response").eq("is_enabled", true).order("display_name"),
    ]).then(([provRes, modRes]) => {
      const provs = (provRes.data as unknown as Provider[]) || [];
      const mods = (modRes.data as unknown as AiModelRow[]) || [];
      setProviders(provs);
      setModels(mods);
      const currModel = mods.find(m => m.model_id === currentModel);
      if (currModel) {
        setSelectedProviderId(currModel.provider_id);
      } else if (provs.length > 0) {
        setSelectedProviderId(provs[0].id);
      }
      setSelectedModel(currentModel);
    }).finally(() => setLoading(false));
  }, [open, currentModel]);

  const filteredModels = (selectedProviderId
    ? models.filter(m => m.provider_id === selectedProviderId)
    : models
  ).filter(m => modelSearch ? m.display_name.toLowerCase().includes(modelSearch.toLowerCase()) || m.model_id.toLowerCase().includes(modelSearch.toLowerCase()) : true);

  const selectedModelData = models.find(m => m.model_id === selectedModel);
  const baseCredits = selectedModelData?.credits_per_response ?? 2;
  const totalCredits = baseCredits * contextMultiplier;
  const selectedMultiplier = CONTEXT_MULTIPLIERS.find(c => c.value === contextMultiplier)!;

  const handleSave = () => {
    onSave(selectedModel, contextMultiplier);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[720px] p-0 gap-0 overflow-hidden rounded-2xl border border-border/15 bg-card shadow-2xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-border/10 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Selecionar Modelo</h2>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">Escolha o modelo e defina o contexto da conversa</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-secondary/50 transition-all">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2.5 text-muted-foreground/30">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[13px]">Carregando modelos...</span>
          </div>
        ) : (
          <div className="flex" style={{ height: 420 }}>

            {/* ── Provedores ───────────────────────────────── */}
            <div className="w-40 border-r border-border/10 flex flex-col overflow-y-auto py-2 shrink-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/30 px-4 pb-2">
                Provedor
              </p>
              {providers.length === 0 && (
                <p className="px-4 text-[11px] text-muted-foreground/30 mt-2">Nenhum conectado</p>
              )}
              {providers.map(p => {
                const meta = PROVIDER_META[p.name];
                const isSelected = selectedProviderId === p.id;
                const count = models.filter(m => m.provider_id === p.id).length;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProviderId(p.id)}
                    className={`relative flex items-center gap-2.5 px-3 py-2.5 mx-1.5 rounded-xl text-left transition-all ${
                      isSelected
                        ? "bg-secondary/60 text-foreground"
                        : "text-muted-foreground/50 hover:bg-secondary/30 hover:text-foreground/80"
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
                    )}
                    {meta ? (
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md overflow-hidden shrink-0 ${meta.logoBg}`}>
                        <img
                          src={meta.logo}
                          alt={p.display_name}
                          className={`h-3 w-3 object-contain ${meta.logoFilter === "invert" ? "invert" : ""}`}
                        />
                      </span>
                    ) : (
                      <span className="h-5 w-5 rounded-md bg-secondary/50 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-[11.5px] font-medium block truncate">{p.display_name}</span>
                    </div>
                    {count > 0 && (
                      <span className={`text-[9px] font-medium tabular-nums shrink-0 ${isSelected ? "text-muted-foreground/50" : "text-muted-foreground/25"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Modelos ───────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-border/10">
              <div className="px-4 py-2.5 border-b border-border/8 space-y-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/30">
                  Modelos disponíveis
                  {filteredModels.length > 0 && (
                    <span className="ml-1.5 text-muted-foreground/20">({filteredModels.length})</span>
                  )}
                </p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/30" />
                  <input
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                    placeholder="Buscar modelo..."
                    className="w-full h-8 pl-7 pr-3 rounded-lg bg-secondary/30 border border-border/15 text-[11px] text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30 focus:bg-secondary/50 transition-all"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {filteredModels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-1.5 text-center py-10">
                    <Bot className="h-6 w-6 text-muted-foreground/20" strokeWidth={1.5} />
                    <p className="text-[12px] text-muted-foreground/30 font-medium">Nenhum modelo ativo</p>
                    <p className="text-[10px] text-muted-foreground/20">Ative no Super Admin</p>
                  </div>
                ) : (
                  filteredModels.map(model => {
                    const isSelected = selectedModel === model.model_id;
                    const tier = creditTier(model.credits_per_response);
                    return (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.model_id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                          isSelected
                            ? "bg-foreground/[0.06] text-foreground"
                            : "text-foreground/60 hover:bg-foreground/[0.03] hover:text-foreground/80"
                        }`}
                      >
                        {/* radio dot */}
                        <div className={`h-3.5 w-3.5 rounded-full shrink-0 border transition-all flex items-center justify-center ${
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-border/30"
                        }`}>
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                        </div>

                        <span className={`flex-1 text-[12.5px] font-medium truncate transition-colors ${isSelected ? "text-foreground" : ""}`}>
                          {model.display_name}
                        </span>

                        {/* credit pill */}
                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${tier.cls}`}>
                          <Coins className="h-2.5 w-2.5" />
                          {model.credits_per_response}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── Contexto ──────────────────────────────────── */}
            <div className="w-56 flex flex-col shrink-0">
              <div className="px-4 py-3 border-b border-border/8">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/30">
                  Contexto
                </p>
              </div>
              <div className="flex-1 flex flex-col p-4 gap-4">

                {/* multiplier grid */}
                <div className="grid grid-cols-5 gap-1">
                  {CONTEXT_MULTIPLIERS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setContextMultiplier(c.value)}
                      className={`py-2 rounded-lg text-[11px] font-bold transition-all ${
                        contextMultiplier === c.value
                          ? "bg-foreground text-background shadow-sm"
                          : "bg-secondary/30 text-muted-foreground/40 hover:bg-secondary/60 hover:text-muted-foreground/70"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* stats */}
                <div className="rounded-xl bg-secondary/20 border border-border/8 divide-y divide-border/8">
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground/40">Histórico</p>
                      <p className="text-[12px] font-semibold text-foreground/70">{selectedMultiplier.messages} msgs</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <Brain className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground/40">Instruções</p>
                      <p className="text-[12px] font-semibold text-foreground/70">{selectedMultiplier.tokens} tokens</p>
                    </div>
                  </div>
                </div>

                {/* cost summary */}
                <div className="mt-auto rounded-xl bg-secondary/15 border border-border/8 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground/40">Modelo</span>
                    <span className="text-foreground/60 font-medium">{baseCredits} cr</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground/40">Contexto</span>
                    <span className="text-foreground/60 font-medium">×{contextMultiplier}</span>
                  </div>
                  <div className="h-px bg-border/10" />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/50">Por resposta</span>
                    <div className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-amber-400/70" />
                      <span className="text-[13px] font-bold text-foreground/80">
                        {totalCredits}
                        <span className="text-[10px] font-normal text-muted-foreground/40 ml-0.5">cr</span>
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10 bg-secondary/5">
          {/* legend */}
          <div className="flex items-center gap-3">
            {[
              { cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", label: "Eco" },
              { cls: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20", label: "Plus" },
              { cls: "bg-amber-500/10 text-amber-400 border border-amber-500/20", label: "Premium" },
              { cls: "bg-red-500/10 text-red-400 border border-red-500/20", label: "Ultra" },
            ].map(t => (
              <span key={t.label} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${t.cls}`}>
                {t.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] text-muted-foreground/50 hover:text-foreground hover:bg-secondary/50 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedModel}
              className="px-4 py-2 rounded-xl bg-foreground text-background text-[12px] font-semibold hover:bg-foreground/90 disabled:opacity-30 transition-all"
            >
              Confirmar
            </button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
