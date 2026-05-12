import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Key, Trash2, RefreshCw, Eye, EyeOff, Check, Loader2,
  Zap, Sparkles, Coins, ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAiModelsAdmin, AiModel, AiProvider } from "@/hooks/useAiModels";
import openaiLogo from "@/assets/providers/openai.svg";
import anthropicLogo from "@/assets/providers/anthropic.svg";
import googleLogo from "@/assets/providers/google.png";
import deepseekLogo from "@/assets/providers/deepseek.png";
import grokLogo from "@/assets/providers/grok.png";
import groqLogo from "@/assets/providers/groq.webp";
import mistralLogo from "@/assets/providers/mistral.png";

const PROVIDERS = [
  {
    name: "openai",
    display: "OpenAI",
    logo: openaiLogo,
    logoBg: "bg-black",
    logoFilter: "invert",
    placeholder: "sk-proj-...",
    hint: "Obtenha em platform.openai.com/api-keys",
  },
  {
    name: "anthropic",
    display: "Anthropic",
    logo: anthropicLogo,
    logoBg: "bg-[#cc785c]",
    logoFilter: "none",
    placeholder: "sk-ant-...",
    hint: "Obtenha em console.anthropic.com/settings/keys",
  },
  {
    name: "google",
    display: "Google Gemini",
    logo: googleLogo,
    logoBg: "bg-white",
    logoFilter: "none",
    placeholder: "AIza...",
    hint: "Obtenha em aistudio.google.com/apikey",
  },
  {
    name: "deepseek",
    display: "DeepSeek",
    logo: deepseekLogo,
    logoBg: "bg-white",
    logoFilter: "none",
    placeholder: "sk-...",
    hint: "Obtenha em platform.deepseek.com/api_keys",
  },
  {
    name: "grok",
    display: "Grok (xAI)",
    logo: grokLogo,
    logoBg: "bg-white",
    logoFilter: "none",
    placeholder: "xai-...",
    hint: "Obtenha em console.x.ai",
  },
  {
    name: "groq",
    display: "Groq",
    logo: groqLogo,
    logoBg: "bg-white",
    logoFilter: "none",
    placeholder: "gsk_...",
    hint: "Obtenha em console.groq.com/keys",
  },
  {
    name: "mistral",
    display: "Mistral AI",
    logo: mistralLogo,
    logoBg: "bg-white",
    logoFilter: "none",
    placeholder: "...",
    hint: "Obtenha em console.mistral.ai/api-keys",
  },
];

// Per-provider state
interface ProviderCardState {
  expanded: boolean;
  apiKey: string;
  showKey: boolean;
  saving: boolean;
  deleting: boolean;
  fetchingModels: boolean;
  models: AiModel[];
  modelsLoaded: boolean;
}

function ProviderCard({
  meta,
  connectedProvider,
  onSave,
  onDelete,
  onFetchModels,
  onToggleModel,
  onUpdateCredits,
}: {
  meta: typeof PROVIDERS[number];
  connectedProvider: { id: string; name: string; api_key: string; is_active: boolean; created_at: string; display_name: string } | undefined;
  onSave: (name: string, key: string) => Promise<AiProvider[]>;
  onDelete: (id: string) => Promise<void>;
  onFetchModels: (id: string) => Promise<AiModel[]>;
  onToggleModel: (modelId: string, enabled: boolean) => Promise<void>;
  onUpdateCredits: (modelId: string, credits: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [editingCredits, setEditingCredits] = useState<Record<string, string>>({});

  const isConnected = !!connectedProvider;
  const enabledCount = models.filter(m => m.is_enabled).length;

  const handleFetchModelsById = async (providerId: string) => {
    setFetchingModels(true);
    try {
      const fetched = await onFetchModels(providerId);
      setModels(fetched);
      setModelsLoaded(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar modelos");
    } finally {
      setFetchingModels(false);
    }
  };

  // Auto-fetch models when provider is connected and card is expanded
  useEffect(() => {
    if (connectedProvider && expanded && !modelsLoaded && !fetchingModels) {
      handleFetchModelsById(connectedProvider.id);
    }
  }, [connectedProvider?.id, expanded, modelsLoaded]);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const updatedProviders = await onSave(meta.name, apiKey.trim());
      setApiKey("");
      setExpanded(true);
      setModelsLoaded(false);
      toast.success(`${meta.display} conectado com sucesso!`);
      // Find the provider ID from the updated list and fetch models immediately
      const saved = updatedProviders.find((p) => p.name === meta.name);
      if (saved) {
        handleFetchModelsById(saved.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar provedor");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!connectedProvider) return;
    setDeleting(true);
    try {
      await onDelete(connectedProvider.id);
      setModels([]);
      setModelsLoaded(false);
      toast.success(`${meta.display} removido`);
    } catch {
      toast.error("Erro ao remover provedor");
    } finally {
      setDeleting(false);
    }
  };

  const handleFetchModels = async () => {
    if (!connectedProvider) return;
    handleFetchModelsById(connectedProvider.id);
  };

  return (
    <div className={`rounded-2xl border transition-colors overflow-hidden ${
      isConnected ? "border-primary/20 bg-card/60" : "border-border/15 bg-card/40"
    } backdrop-blur-xl`}>
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden shrink-0 shadow-sm ${meta.logoBg}`}>
          <img
            src={meta.logo}
            alt={meta.display}
            className={`h-5 w-5 object-contain ${meta.logoFilter === "invert" ? "invert" : ""}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{meta.display}</p>
          {isConnected ? (
            <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1.5">
              {fetchingModels ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-primary/60" />
                  Carregando modelos...
                </>
              ) : (
                <>Conectado · {enabledCount} modelo{enabledCount !== 1 ? "s" : ""} ativado{enabledCount !== 1 ? "s" : ""}</>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">Não configurado</p>
          )}
        </div>
        {isConnected && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Check className="h-2 w-2" /> Conectado
          </span>
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/10 px-5 py-4 space-y-4">
              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                  {isConnected ? "Atualizar API Key" : "API Key"}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKey ? "text" : "password"}
                      placeholder={meta.placeholder}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSave()}
                      className="pr-10 bg-secondary/20 border-border/15 h-10 text-[13px] rounded-xl font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={!apiKey.trim() || saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/90 hover:bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                    {isConnected ? "Atualizar" : "Conectar"}
                  </button>
                  {isConnected && (
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-destructive/10 text-destructive/60 hover:bg-destructive/20 border border-destructive/10 transition-colors"
                    >
                      {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/35">{meta.hint}</p>
              </div>

              {/* Models section */}
              {isConnected && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                      Modelos Disponíveis
                    </label>
                    <button
                      onClick={handleFetchModels}
                      disabled={fetchingModels}
                      className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-secondary/40 text-foreground/60 hover:bg-secondary/70 border border-border/15 transition-colors"
                    >
                      {fetchingModels
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RefreshCw className="h-3 w-3" />}
                      {modelsLoaded ? "Atualizar lista" : "Buscar modelos"}
                    </button>
                  </div>

                  {fetchingModels && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center py-8 gap-3 text-muted-foreground/50"
                    >
                      <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
                      <span className="text-xs font-medium">Carregando modelos disponíveis...</span>
                    </motion.div>
                  )}

                  {!fetchingModels && models.length === 0 && !modelsLoaded && (
                    <div className="flex flex-col items-center justify-center py-5 gap-2 rounded-xl border border-dashed border-border/20 bg-secondary/10">
                      <Sparkles className="h-5 w-5 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground/40">Clique em "Buscar modelos" para carregar</p>
                    </div>
                  )}

                  {!fetchingModels && models.length === 0 && modelsLoaded && (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      <Bot className="h-6 w-6 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground/40">Nenhum modelo encontrado</p>
                    </div>
                  )}

                  {!fetchingModels && models.length > 0 && (
                    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                      {models.map(model => {
                        const creditsValue = editingCredits[model.id] ?? String(model.credits_per_response ?? 2);
                        return (
                          <div
                            key={model.id}
                            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                              model.is_enabled ? "bg-primary/5 border border-primary/10" : "hover:bg-secondary/30"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${model.is_enabled ? "bg-emerald-400" : "bg-muted-foreground/20"}`} />
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-medium text-foreground/80 truncate">{model.display_name}</p>
                                <p className="text-[10px] text-muted-foreground/40 font-mono truncate">{model.model_id}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/20 bg-secondary/30 text-[10px] text-muted-foreground/60 font-medium whitespace-nowrap">
                                <Coins className="h-2.5 w-2.5 text-amber-400/70 shrink-0" />
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={creditsValue}
                                  onChange={e => setEditingCredits(prev => ({ ...prev, [model.id]: e.target.value }))}
                                  onBlur={async e => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val > 0) {
                                      await onUpdateCredits(model.id, val);
                                      setModels(prev => prev.map(m => m.id === model.id ? { ...m, credits_per_response: val } : m));
                                    } else {
                                      setEditingCredits(prev => ({ ...prev, [model.id]: String(model.credits_per_response ?? 2) }));
                                    }
                                  }}
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") {
                                      const val = parseInt(creditsValue);
                                      if (!isNaN(val) && val > 0) {
                                        await onUpdateCredits(model.id, val);
                                        setModels(prev => prev.map(m => m.id === model.id ? { ...m, credits_per_response: val } : m));
                                      }
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  className="w-8 bg-transparent text-center text-[10px] font-medium text-foreground/70 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <span>crédito{parseInt(creditsValue) !== 1 ? "s" : ""}</span>
                              </div>
                              <Switch
                                checked={model.is_enabled}
                                onCheckedChange={async checked => {
                                  await onToggleModel(model.id, checked);
                                  setModels(prev => prev.map(m => m.id === model.id ? { ...m, is_enabled: checked } : m));
                                }}
                                className="shrink-0"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AiModelsTab() {
  const {
    providers,
    loading,
    loadProviders,
    saveProvider,
    deleteProvider,
    fetchModels,
    toggleModel,
    updateModelCredits,
  } = useAiModelsAdmin();

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleFetchModels = async (providerId: string): Promise<AiModel[]> => {
    const result = await fetchModels(providerId);
    return result;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary/60" strokeWidth={1.5} />
            Provedores de IA
          </h2>
          <p className="text-[11px] text-muted-foreground/40 mt-0.5">
            Configure as APIs e selecione quais modelos ficam disponíveis para os usuários
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />}
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        {PROVIDERS.map(meta => {
          const connected = providers.find(p => p.name === meta.name);
          return (
            <ProviderCard
              key={meta.name}
              meta={meta}
              connectedProvider={connected}
              onSave={saveProvider}
              onDelete={deleteProvider}
              onFetchModels={handleFetchModels}
              onToggleModel={toggleModel}
              onUpdateCredits={updateModelCredits}
            />
          );
        })}
      </div>

      {/* Info */}
      <div className="rounded-xl border border-border/10 bg-secondary/10 p-4 text-[11px] text-muted-foreground/50 space-y-1">
        <p className="font-medium text-foreground/40">Como funciona:</p>
        <p>1. Expanda o provedor desejado e insira a API Key</p>
        <p>2. Clique em "Buscar modelos" para carregar a lista de modelos disponíveis</p>
        <p>3. Ative os modelos e defina o custo em créditos por resposta</p>
        <p>4. Os modelos ativados aparecem automaticamente na criação de agentes</p>
      </div>
    </div>
  );
}
