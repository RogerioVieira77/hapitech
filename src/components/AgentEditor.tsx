import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Save, User, Briefcase, GraduationCap, Settings, MessageSquare, Bot, Target, Server, Share2, Plus, Check, Sparkles, X, ChevronRight, ChevronDown, Pencil, Loader2, Smile, Pen, Ban, LayoutList, Bell, Globe, Clock, UserCheck, Info, Webhook, GitBranch, Trash2, Puzzle, Menu, CalendarClock, Search, CornerDownLeft, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUpdateAgent, useAgents, type Agent } from "@/hooks/useAgents";
import { AgentChat } from "@/components/AgentChat";
import { AgentKnowledgeSection } from "@/components/AgentKnowledgeSection";
import { useEvolutionApi } from "@/hooks/useEvolutionApi";
import { useTelegramConnections } from "@/hooks/useTelegramConnections";
import { useClinicorpConnections } from "@/hooks/useClinicorpConnections";
import { useSolarMarketConnections } from "@/hooks/useSolarMarketConnections";
import { useWidgetConnections } from "@/hooks/useWidgetConnections";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ModelSelectorModal } from "@/components/ModelSelectorModal";
import whatsappLogo from "@/assets/whatsapp-logo.webp";
import telegramLogo from "@/assets/telegram-logo.png";
import elevenLabsLogo from "@/assets/elevenlabs-logo.png";
import googleCalendarLogo from "@/assets/google-calendar-logo.png";
import clinicorpLogo from "@/assets/clinicorp-logo.svg";
import solarMarketLogo from "@/assets/solarmarket-logo.svg";
import { McpIntegrations } from "@/components/McpIntegrations";
import { GoogleCalendarWizard } from "@/components/GoogleCalendarWizard";
import { useGoogleCalendarConnections } from "@/hooks/useGoogleCalendar";
import { useTags } from "@/hooks/useTags";
import { ElevenLabsSection } from "@/components/ElevenLabsSection";
import type { SolarMarketConnection } from "@/hooks/useSolarMarketConnections";

// Extended Agent type with optional fields from database
interface ExtendedAgent extends Agent {
  split_response_max_chars?: number | null;
  split_delay_ms?: number | null;
  max_response_chars?: number | null;
  
  inactivity_rules?: string | InactivityRule[] | null;
  webhook_rules?: string | WebhookRule[] | null;
  transfer_rules?: string | TransferRule[] | null;
}

// Types for Solar Market API responses
interface SolarMarketStage {
  id: string | number;
  name: string;
}

interface SolarMarketFunnel {
  id: string | number;
  name: string;
  stages?: SolarMarketStage[];
  steps?: SolarMarketStage[];
}

interface SolarMarketUser {
  id: string | number;
  name?: string;
  email?: string;
}

interface SolarMarketSettings {
  create_lead?: boolean;
  funnel_id?: string;
  stage_id?: string;
  responsible_id?: string;
  functions?: Record<string, boolean>;
  [key: string]: unknown;
}

interface InactivityRule {
  id: number;
  minutes: number;
  message: string;
  action?: string;
}

interface WebhookRule {
  id: number;
  url: string;
  events: string[];
  event?: string;
  method?: string;
}

interface TransferRule {
  id: number;
  targetType: string;
  targetAgentId?: string;
  instructions: string;
  returnOnFinish: boolean;
  silentTransfer: boolean;
  tags?: string[];
}

/* ── Solar Market Config Panel (sidebar layout) ── */
function SolarMarketConfigPanel({ conn, deleteSolarMarket, onClose }: {
  conn: SolarMarketConnection & { settings?: Record<string, unknown> };
  deleteSolarMarket: { mutate: (id: string, opts?: { onSuccess?: () => void }) => void; isPending: boolean };
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState<"conexao" | "funcoes">("conexao");

  // Load persisted settings from connection
  const savedSettings = (conn.settings || {}) as SolarMarketSettings;
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>(savedSettings.funnel_id || "");
  const [selectedStageId, setSelectedStageId] = useState<string>(savedSettings.stage_id || "");
  const [createLeadEnabled, setCreateLeadEnabled] = useState<boolean>(savedSettings.create_lead ?? true);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<string>(savedSettings.responsible_id || "");
  const [functionToggles, setFunctionToggles] = useState<Record<string, boolean>>({
    query_clients: savedSettings.functions?.query_clients ?? true,
    manage_projects: savedSettings.functions?.manage_projects ?? true,
    manage_proposals: savedSettings.functions?.manage_proposals ?? true,
    manage_funnels: savedSettings.functions?.manage_funnels ?? true,
    custom_fields: savedSettings.functions?.custom_fields ?? true,
  });

  // Persist settings to DB
  const saveSettings = async (overrides?: Partial<SolarMarketSettings>) => {
    const settings: SolarMarketSettings = {
      create_lead: createLeadEnabled,
      funnel_id: selectedFunnelId,
      stage_id: selectedStageId,
      responsible_id: selectedResponsibleId,
      functions: functionToggles,
      ...overrides,
    };
    await supabase
      .from("solarmarket_connections")
      .update({ settings: settings as any })
      .eq("id", conn.id);
  };

  // Fetch funnels from Solar Market API
  const { data: funnelsData, isLoading: loadingFunnels } = useQuery({
    queryKey: ["solarmarket_funnels", conn.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("solarmarket-query", {
        body: { action: "list_funnels" },
      });
      if (error) throw error;
      return data?.data || [];
    },
    enabled: !!user?.id && !!conn.id,
  });

  const funnels: SolarMarketFunnel[] = (funnelsData?.data || funnelsData || []) as SolarMarketFunnel[];

  // Fetch users from Solar Market API
  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["solarmarket_users", conn.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("solarmarket-query", {
        body: { action: "list_users" },
      });
      if (error) throw error;
      return data?.data || [];
    },
    enabled: !!user?.id && !!conn.id,
  });

  const users: SolarMarketUser[] = (usersData?.data || usersData || []) as SolarMarketUser[];

  // Get stages from selected funnel
  const selectedFunnel = funnels.find((f) => String(f.id) === selectedFunnelId);
  const stages: SolarMarketStage[] = selectedFunnel?.stages || selectedFunnel?.steps || [];

  useEffect(() => {
    if (funnels.length > 0 && !selectedFunnelId) {
      const id = String(funnels[0].id);
      setSelectedFunnelId(id);
      saveSettings({ funnel_id: id });
    }
  }, [funnels, selectedFunnelId]);

  useEffect(() => {
    if (stages.length > 0 && !selectedStageId) {
      const id = String(stages[0].id);
      setSelectedStageId(id);
      saveSettings({ stage_id: id });
    }
  }, [stages, selectedStageId]);

  useEffect(() => {
    if (users.length > 0 && !selectedResponsibleId) {
      const id = String(users[0].id);
      setSelectedResponsibleId(id);
      saveSettings({ responsible_id: id });
    }
  }, [users, selectedResponsibleId]);

  const handleFunnelChange = (v: string) => {
    setSelectedFunnelId(v);
    setSelectedStageId("");
    saveSettings({ funnel_id: v, stage_id: "" });
  };

  const handleStageChange = (v: string) => {
    setSelectedStageId(v);
    saveSettings({ stage_id: v });
  };

  const handleResponsibleChange = (v: string) => {
    setSelectedResponsibleId(v);
    saveSettings({ responsible_id: v });
  };

  const handleCreateLeadToggle = (checked: boolean) => {
    setCreateLeadEnabled(checked);
    saveSettings({ create_lead: checked });
  };

  const handleFunctionToggle = (key: string, checked: boolean) => {
    const updated = { ...functionToggles, [key]: checked };
    setFunctionToggles(updated);
    saveSettings({ functions: updated });
  };

  const navItems = [
    { key: "conexao" as const, label: "Conexão", icon: Settings },
    { key: "funcoes" as const, label: "Funções", icon: Puzzle },
  ];

  const functions = [
    { key: "query_clients", label: "Consultar clientes e leads", desc: "Buscar informações de clientes e leads cadastrados" },
    { key: "manage_projects", label: "Listar e criar projetos", desc: "Visualizar projetos existentes e criar novos" },
    { key: "manage_proposals", label: "Gerar e consultar propostas", desc: "Criar propostas comerciais e consultar existentes" },
    { key: "manage_funnels", label: "Gerenciar funis de vendas", desc: "Mover leads entre etapas do funil" },
    { key: "custom_fields", label: "Campos customizados", desc: "Acessar e preencher campos personalizados" },
  ];

  return (
    <div className="flex min-h-[500px]">
      {/* Side nav */}
      <div className="w-[180px] border-r border-border/20 p-4 space-y-1">
        <p className="text-xs text-muted-foreground/50 mb-3 font-medium">Menu</p>
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveNav(item.key)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeNav === item.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 flex flex-col overflow-y-auto max-h-[70vh]">
        <AnimatePresence mode="wait">
          {activeNav === "conexao" && (
            <motion.div key="conexao" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
              <h3 className="text-base font-semibold mb-5">Conexão</h3>

              {/* Status */}
              <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/15 bg-primary/5 mb-4">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-xs text-primary font-medium">Integração ativa</span>
              </div>

              {/* Empresa */}
              <div className="space-y-1.5 mb-4">
                <Label className="text-xs font-semibold text-foreground">Nome da empresa</Label>
                <Input
                  value={conn.company_name || ""}
                  onChange={async (e) => {
                    const val = e.target.value;
                    await supabase.from("solarmarket_connections").update({ company_name: val }).eq("id", conn.id);
                  }}
                  placeholder="Ex: Solar Energy Ltda"
                  className="bg-background/50 border-border/40 h-9 text-sm"
                />
              </div>

              {/* API Key */}
              <div className="space-y-1.5 mb-4">
                <Label className="text-xs font-semibold text-foreground">Chave de API</Label>
                <Input
                  defaultValue={conn.api_key || ""}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val && val !== conn.api_key) {
                      await supabase.from("solarmarket_connections").update({ api_key: val }).eq("id", conn.id);
                      toast.success("Chave de API atualizada!");
                    }
                  }}
                  type="password"
                  placeholder="sk-..."
                  className="bg-background/50 border-border/40 h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground/50">
                  Obtenha sua chave em{" "}
                  <a href="https://www.solarmarket.com.br/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    solarmarket.com.br
                  </a>
                </p>
              </div>

              {/* Como funciona */}
              <div className="space-y-1.5 mb-6">
                <Label className="text-xs font-semibold text-foreground">Como funciona</Label>
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                  Durante uma conversa, quando o cliente perguntar sobre projetos, propostas ou leads, o agente consulta a API da Solar Market automaticamente e responde com os dados atualizados da sua conta.
                </p>
              </div>

              {/* Desconectar */}
              <div className="mt-auto pt-4 border-t border-border/30">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={() => {
                    deleteSolarMarket.mutate(conn.id, { onSuccess: onClose });
                  }}
                  disabled={deleteSolarMarket.isPending}
                >
                  {deleteSolarMarket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Desconectar Solar Market
                </Button>
              </div>
            </motion.div>
          )}

          {activeNav === "funcoes" && (
            <motion.div key="funcoes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
              <h3 className="text-base font-semibold mb-2">Funções do agente</h3>
              <p className="text-[11px] text-muted-foreground/60 mb-4">Escolha quais funções o agente poderá executar via Solar Market.</p>

              <div className="space-y-2.5">
                {/* Criar Lead */}
                <div className="rounded-xl border border-border/20 bg-secondary/5 hover:bg-secondary/10 transition-colors overflow-hidden">
                  <div className="flex items-start gap-3 p-3">
                    <Switch checked={createLeadEnabled} onCheckedChange={handleCreateLeadToggle} className="mt-0.5 data-[state=checked]:bg-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">Criar lead automaticamente</p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5">Quando um novo contato enviar mensagem, criar lead no CRM</p>
                    </div>
                  </div>
                  {createLeadEnabled && (
                    <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-border/15 ml-[44px]">
                      {loadingFunnels ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
                          <span className="text-[11px] text-muted-foreground/50">Carregando funis da Solar Market...</span>
                        </div>
                      ) : funnels.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/50 py-2">Nenhum funil encontrado na Solar Market.</p>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground/70 font-medium">Funil</Label>
                            <Select value={selectedFunnelId} onValueChange={handleFunnelChange}>
                              <SelectTrigger className="h-8 text-xs bg-background/50 border-border/30">
                                <SelectValue placeholder="Selecione o funil" />
                              </SelectTrigger>
                              <SelectContent>
                                {funnels.map((f) => (<SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground/70 font-medium">Responsável</Label>
                            <Select value={selectedResponsibleId} onValueChange={handleResponsibleChange}>
                              <SelectTrigger className="h-8 text-xs bg-background/50 border-border/30">
                                <SelectValue placeholder="Selecione o responsável" />
                              </SelectTrigger>
                              <SelectContent>
                                {users.map((u) => (<SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                          {stages.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground/70 font-medium">Etapa</Label>
                              <Select value={selectedStageId} onValueChange={handleStageChange}>
                                <SelectTrigger className="h-8 text-xs bg-background/50 border-border/30">
                                  <SelectValue placeholder="Selecione a etapa" />
                                </SelectTrigger>
                                <SelectContent>
                                  {stages.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Other functions */}
                {functions.map(fn => (
                  <div key={fn.key} className="flex items-start gap-3 p-3 rounded-xl border border-border/20 bg-secondary/5 hover:bg-secondary/10 transition-colors">
                    <Switch
                      checked={functionToggles[fn.key] ?? true}
                      onCheckedChange={(checked) => handleFunctionToggle(fn.key, checked)}
                      className="mt-0.5 data-[state=checked]:bg-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">{fn.label}</p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5">{fn.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


type Section = "perfil" | "prompt" | "trabalho" | "treinamentos" | "intencoes" | "integracoes" | "voz" | "servidores-mcp" | "canais" | "configuracoes";

const navItems: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: "perfil", label: "Perfil", icon: User },
  { key: "prompt", label: "Prompt", icon: MessageSquare },
  { key: "trabalho", label: "Trabalho", icon: Briefcase },
  { key: "treinamentos", label: "Treinamentos", icon: GraduationCap },
  { key: "intencoes", label: "Intenções", icon: Target },
  { key: "integracoes", label: "Integrações", icon: Puzzle },
  { key: "servidores-mcp", label: "Servidores MCP", icon: Server },
  { key: "canais", label: "Canais", icon: Share2 },
  { key: "configuracoes", label: "Configurações", icon: Settings },
];

const communicationStyles = [
  { value: "formal", label: "FORMAL" },
  { value: "normal", label: "NORMAL" },
  { value: "descontraida", label: "DESCONTRAÍDA" },
];

const purposeOptions = [
  { value: "suporte", label: "Suporte", description: "Use essa opção sempre que o objetivo do seu agente for prestar suporte.", icon: MessageSquare },
  { value: "vendas", label: "Vendas", description: "Use sempre que quiser criar um agente de IA no setor de vendas.", icon: Briefcase },
  { value: "pessoal", label: "Uso pessoal", description: "Escolha esta opção caso queira um agente para uso pessoal.", icon: User },
];

// ─── TransferTargetPicker ────────────────────────────────────────────────────

interface PickerItem { id: string; name: string; avatar: string | null; subtitle?: string }

function TransferTargetPicker({ value, onChange, type, items }: {
  value: string;
  onChange: (v: string) => void;
  type: "agente" | "humano";
  items: PickerItem[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = items.find(i => i.id === value);
  const Icon = type === "agente" ? Bot : User;

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="w-[180px] h-9 px-3 flex items-center gap-2 text-xs bg-primary/5 border border-primary/15 rounded-lg shadow-sm hover:border-primary/30 transition-colors text-left">
          {selected?.avatar ? (
            <img src={selected.avatar} className="w-5 h-5 rounded-full object-cover shrink-0" alt="" />
          ) : (
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary/60" />
          )}
          <span className="truncate font-medium">{selected?.name || "Selecione"}</span>
          <ChevronDown className="h-3 w-3 ml-auto shrink-0 text-muted-foreground/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0 bg-popover border border-border/40 shadow-xl z-50" align="start" sideOffset={4}>
        <div className="p-2 border-b border-border/20">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Busque por nome..."
            className="w-full h-7 px-2 text-xs bg-background/60 border border-border/25 rounded-md outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
            autoFocus
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 text-center py-4">Nenhum resultado</p>
          )}
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => { onChange(item.id); setOpen(false); setSearch(""); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/50 transition-colors ${value === item.id ? "bg-accent/30" : ""}`}
            >
              {item.avatar ? (
                <img src={item.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/8 border border-border/20 flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-primary/40" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{item.name}</p>
                {item.subtitle && <p className="text-[10px] text-muted-foreground/50 truncate">{item.subtitle}</p>}
              </div>
              {value === item.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── BusinessHoursModal ─────────────────────────────────────────────────────

const WEEKDAYS = [
  { key: "seg", label: "Seg", full: "Segunda-feira" },
  { key: "ter", label: "Ter", full: "Terça-feira" },
  { key: "qua", label: "Qua", full: "Quarta-feira" },
  { key: "qui", label: "Qui", full: "Quinta-feira" },
  { key: "sex", label: "Sex", full: "Sexta-feira" },
  { key: "sab", label: "Sab", full: "Sábado" },
  { key: "dom", label: "Dom", full: "Domingo" },
];

interface DaySchedule { enabled: boolean; start: string; end: string }
interface BusinessHours { allowAnytime: boolean; days: Record<string, DaySchedule> }

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  allowAnytime: true,
  days: Object.fromEntries(WEEKDAYS.map(d => [d.key, {
    enabled: ["seg","ter","qua","qui","sex"].includes(d.key),
    start: "08:00",
    end: "18:00",
  }])),
};

function BusinessHoursModal({ open, onClose, value, onChange }: {
  open: boolean; onClose: () => void;
  value: BusinessHours; onChange: (v: BusinessHours) => void;
}) {
  const [local, setLocal] = useState<BusinessHours>(value);
  useEffect(() => { if (open) setLocal(value); }, [open]);

  const toggleDay = (key: string) => {
    setLocal(prev => ({
      ...prev,
      days: { ...prev.days, [key]: { ...prev.days[key], enabled: !prev.days[key].enabled } },
    }));
  };
  const setTime = (key: string, field: "start" | "end", val: string) => {
    setLocal(prev => ({
      ...prev,
      days: { ...prev.days, [key]: { ...prev.days[key], [field]: val } },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden border-border/20 shadow-2xl" style={{ background: 'hsl(var(--card))' }}>
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[16px] font-bold">Configurar horários permitidos</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Allow anytime toggle */}
          <div className="flex items-start gap-3.5 p-3 rounded-xl border border-border/15" style={{ background: 'hsl(var(--secondary) / 0.1)' }}>
            <CalendarClock className="h-5 w-5 text-primary/60 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium">Permitir executar em qualquer horário</p>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">O agente pode enviar mensagem em qualquer horário</p>
            </div>
            <Switch checked={local.allowAnytime} onCheckedChange={(v) => setLocal(prev => ({ ...prev, allowAnytime: v }))} />
          </div>

          {!local.allowAnytime && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-4">
              <div>
                <p className="text-[12px] font-semibold text-foreground/70 mb-2.5">Horários permitidos</p>
                {/* Day pills */}
                <div className="flex gap-1.5 mb-4">
                  {WEEKDAYS.map(d => (
                    <button
                      key={d.key}
                      onClick={() => toggleDay(d.key)}
                      className={`h-8 w-8 rounded-full text-[10px] font-bold transition-all ${
                        local.days[d.key].enabled
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-secondary/30 text-muted-foreground/40 hover:bg-secondary/60"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {/* Time ranges */}
                <div className="space-y-2">
                  {WEEKDAYS.filter(d => local.days[d.key].enabled).map(d => (
                    <div key={d.key} className="flex items-center gap-2.5">
                      <span className="text-[12px] text-foreground/70 w-[110px] shrink-0">{d.full}</span>
                      <input
                        type="time"
                        value={local.days[d.key].start}
                        onChange={(e) => setTime(d.key, "start", e.target.value)}
                        className="h-8 px-2.5 text-[12px] rounded-lg border border-border/25 bg-background/50 text-foreground outline-none focus:border-primary/30"
                      />
                      <span className="text-muted-foreground/30 text-xs">–</span>
                      <input
                        type="time"
                        value={local.days[d.key].end}
                        onChange={(e) => setTime(d.key, "end", e.target.value)}
                        className="h-8 px-2.5 text-[12px] rounded-lg border border-border/25 bg-background/50 text-foreground outline-none focus:border-primary/30"
                      />
                      <button onClick={() => toggleDay(d.key)} className="text-muted-foreground/20 hover:text-foreground/50 transition-colors">
                        <Plus className="h-3.5 w-3.5 rotate-45" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <Button onClick={() => { onChange(local); onClose(); }} className="w-full font-semibold">
            APLICAR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ConfiguracoesSection ───────────────────────────────────────────────────

type ConfigTab = "conversa" | "inatividade" | "webhooks" | "transferencia";

function ConfiguracoesSection({ agent, onSave }: { agent: ExtendedAgent; onSave: (a: Agent) => void }) {
  const [activeTab, setActiveTab] = useState<ConfigTab>("conversa");
  const updateAgent = useUpdateAgent();
  const { data: allAgents } = useAgents();
  const otherActiveAgents = (allAgents || []).filter(a => a.id !== agent.id && a.status === "active");
  const { tags: allTags, createTag } = useTags();

  // Fetch team members for "humano" transfer target
  const { data: teamMembers } = useQuery({
    queryKey: ["team-members-for-transfer"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, display_name, avatar_url");
      return (data || []) as { user_id: string; display_name: string | null; avatar_url: string | null }[];
    },
  });

  // ── Conversa ────────────────────────────────────────────────────────────────
  const [toggles, setToggles] = useState({
    transferirHumano: agent.transfer_to_human ?? false,
    resumoTransferencia: agent.summary_on_transfer ?? false,
    emojis: agent.use_emojis ?? true,
    assinarNome: agent.sign_agent_name ?? false,
    restringirTemas: agent.restrict_topics ?? false,
    dividirResposta: agent.split_responses ?? true,
    lembretes: agent.allow_reminders ?? true,
    buscaInteligente: agent.smart_training_search ?? true,
  });
  const [timezone, setTimezone] = useState(agent.agent_timezone ?? "America/Sao_Paulo");
  const [tempoResposta, setTempoResposta] = useState(String(agent.response_delay_seconds ?? 0));
  const [limiteInteracoes, setLimiteInteracoes] = useState(agent.max_interactions == null ? "sem_limite" : String(agent.max_interactions));
  const [splitMaxChars, setSplitMaxChars] = useState(String(agent.split_response_max_chars ?? ""));
  const [splitDelayMs, setSplitDelayMs] = useState(String(agent.split_delay_ms ?? 800));
  const [maxResponseChars, setMaxResponseChars] = useState(String(agent.max_response_chars ?? ""));

  // Business hours
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [showBusinessHoursModal, setShowBusinessHoursModal] = useState(false);

  const handleToggle = (key: keyof typeof toggles, value: boolean) => {
    setToggles(t => ({ ...t, [key]: value }));
  };

  const handleSaveConversa = () => {
    const payload: Partial<ExtendedAgent> & { id: string } = {
      id: agent.id,
      transfer_to_human: toggles.transferirHumano,
      summary_on_transfer: toggles.resumoTransferencia,
      use_emojis: toggles.emojis,
      sign_agent_name: toggles.assinarNome,
      restrict_topics: toggles.restringirTemas,
      split_responses: toggles.dividirResposta,
      allow_reminders: toggles.lembretes,
      smart_training_search: toggles.buscaInteligente,
      agent_timezone: timezone,
      response_delay_seconds: Number(tempoResposta) || 0,
      max_interactions: limiteInteracoes === "sem_limite" ? null : Number(limiteInteracoes),
      split_response_max_chars: splitMaxChars === "" ? null : Number(splitMaxChars),
      split_delay_ms: splitDelayMs === "" ? 800 : Number(splitDelayMs),
      max_response_chars: maxResponseChars === "" ? null : Number(maxResponseChars),
    };
    updateAgent.mutate(payload, {
      onSuccess: (data) => onSave(data),
    });
  };

  // ── Inatividade ─────────────────────────────────────────────────────────────
  const parseJsonb = <T,>(val: string | T[] | null | undefined, fallback: T[]): T[] => {
    try { return Array.isArray(val) ? val : (val ? JSON.parse(val as string) : fallback); } catch { return fallback; }
  };

  const [inactivityRules, setInactivityRules] = useState<InactivityRule[]>(() =>
    parseJsonb(agent.inactivity_rules, [])
  );

  const handleSaveInatividade = () => {
    updateAgent.mutate({ id: agent.id, inactivity_rules: inactivityRules } as Partial<ExtendedAgent> & { id: string }, {
      onSuccess: (data) => onSave(data),
    });
  };

  // ── Webhooks ─────────────────────────────────────────────────────────────────
  const [webhookRules, setWebhookRules] = useState<WebhookRule[]>(() =>
    parseJsonb(agent.webhook_rules, [])
  );

  const handleSaveWebhooks = () => {
    updateAgent.mutate({ id: agent.id, webhook_rules: webhookRules } as Partial<ExtendedAgent> & { id: string }, {
      onSuccess: (data) => onSave(data),
    });
  };

  // ── Transferência ────────────────────────────────────────────────────────────
  const [transferRules, setTransferRules] = useState<TransferRule[]>(() =>
    parseJsonb(agent.transfer_rules, [])
  );
  const [newTagColors, setNewTagColors] = useState<Record<number, string>>({});

  const TAG_PREMIUM_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#78716c', '#64748b', '#0d9488', '#7c3aed',
  ];

  // Sync state when agent prop changes (after save or external update)
  useEffect(() => {
    setInactivityRules(parseJsonb(agent.inactivity_rules, []));
    setWebhookRules(parseJsonb(agent.webhook_rules, []));
    setTransferRules(parseJsonb(agent.transfer_rules, []));
  }, [agent.id, agent.updated_at]);

  const handleSaveTransferencia = () => {
    updateAgent.mutate({ id: agent.id, transfer_rules: transferRules } as Partial<ExtendedAgent> & { id: string }, {
      onSuccess: (data) => onSave(data),
    });
  };

  const configTabs: { key: ConfigTab; label: string }[] = [
    { key: "conversa", label: "Conversa" },
    { key: "inatividade", label: "Ações de inatividade" },
    { key: "webhooks", label: "Webhooks" },
    { key: "transferencia", label: "Regras de transferência" },
  ];

  const conversaItems = [
    { key: "transferirHumano" as const, label: "Transferir para humano", desc: "Habilite para que o agente possa transferir o atendimento para aba 'em espera' de equipe humana.", icon: UserCheck },
    { key: "resumoTransferencia" as const, label: "Resumo ao transferir para humano", desc: "Permite ao agente gerar automaticamente um resumo do atendimento ao transferir a conversa da IA para um atendente humano.", icon: Pen },
    { key: "emojis" as const, label: "Usar Emojis Nas Respostas", desc: "Define se o agente pode utilizar emojis em suas respostas.", icon: Smile },
    { key: "assinarNome" as const, label: "Assinar nome do agente nas respostas", desc: "Ative esta opção para que o agente de IA adicione automaticamente sua assinatura em cada resposta enviada ao usuário.", icon: Pen },
    { key: "restringirTemas" as const, label: "Restringir Temas Permitidos", desc: "Marque essa opção para que o agente não fale sobre outros assuntos.", icon: Ban },
    { key: "dividirResposta" as const, label: "Dividir resposta em partes", desc: "Em caso da mensagem ficar grande, o agente pode separar em várias mensagens.", icon: LayoutList },
    { key: "lembretes" as const, label: "Permitir registrar lembretes", desc: "Habilite essa opção para que o agente tenha a capacidade de registrar lembretes ao usuário.", icon: Bell },
    { key: "buscaInteligente" as const, label: "Busca inteligente do treinamento", desc: "O agente consulta a base de treinamentos no momento certo, para trazer respostas mais precisas.", icon: Info, badge: "Beta" },
  ];

  return (
    <div className="space-y-0">
      <h2 className="text-[15px] font-semibold mb-1">Preferências da conversa</h2>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border/20 mb-6">
        {configTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-[12px] font-medium transition-colors relative whitespace-nowrap ${
              activeTab === tab.key
                ? "text-primary"
                : "text-muted-foreground/60 hover:text-foreground/80"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <motion.div
                layoutId="config-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
        >

          {/* ── Conversa ── */}
          {activeTab === "conversa" && (
            <div className="space-y-0">
              {conversaItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.key} className="border-b border-border/15">
                    <div className="flex items-start gap-3.5 py-4">
                      <Icon className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" strokeWidth={1.5} />
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium">{item.label}</p>
                          {item.badge && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">{item.badge}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">{item.desc}</p>
                        {item.key === "dividirResposta" && toggles.dividirResposta && (
                          <div className="space-y-2 mt-3">
                            <div className="flex items-center gap-2">
                              <p className="text-[11px] text-muted-foreground/70 w-[160px]">Máximo de caracteres por parte:</p>
                              <Input
                                type="number"
                                min={50}
                                max={4000}
                                placeholder="Sem limite"
                                value={splitMaxChars}
                                onChange={(e) => setSplitMaxChars(e.target.value)}
                                className="w-[100px] h-7 text-xs bg-background/50 border-border/40 text-center"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-[11px] text-muted-foreground/70 w-[160px]">Delay entre partes (ms):</p>
                              <Input
                                type="number"
                                min={0}
                                max={10000}
                                step={100}
                                placeholder="800"
                                value={splitDelayMs}
                                onChange={(e) => setSplitDelayMs(e.target.value)}
                                className="w-[100px] h-7 text-xs bg-background/50 border-border/40 text-center"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <Switch
                        checked={toggles[item.key]}
                        onCheckedChange={(v) => handleToggle(item.key, v)}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Dropdowns */}
              <div className="flex items-start gap-3.5 py-4 border-b border-border/15">
                <Globe className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">Timezone do agente</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Escolha o timezone que agente usará para datas, por exemplo agendar reuniões.</p>
                </div>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-[200px] h-8 text-xs bg-background/50 border-border/40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Sao_Paulo">(GMT-03:00) São Paulo</SelectItem>
                    <SelectItem value="America/New_York">(GMT-05:00) New York</SelectItem>
                    <SelectItem value="Europe/London">(GMT+00:00) London</SelectItem>
                    <SelectItem value="Europe/Paris">(GMT+01:00) Paris</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start gap-3.5 py-4 border-b border-border/15">
                <Clock className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">Tempo de resposta</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Defina um intervalo para o agente esperar e dar uma resposta.</p>
                </div>
                <Select value={tempoResposta} onValueChange={setTempoResposta}>
                  <SelectTrigger className="w-[140px] h-8 text-xs bg-background/50 border-border/40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Imediato</SelectItem>
                    <SelectItem value="3">3 segundos</SelectItem>
                    <SelectItem value="5">5 segundos</SelectItem>
                    <SelectItem value="10">10 segundos</SelectItem>
                    <SelectItem value="30">30 segundos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start gap-3.5 py-4 border-b border-border/15">
                <MessageSquare className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">Limite de caracteres por resposta</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Máximo de caracteres que a resposta da IA pode ter. Deixe em branco para sem limite.</p>
                </div>
                <Input
                  type="number"
                  min={50}
                  max={10000}
                  placeholder="Sem limite"
                  value={maxResponseChars}
                  onChange={(e) => setMaxResponseChars(e.target.value)}
                  className="w-[120px] h-8 text-xs bg-background/50 border-border/40 text-center shrink-0"
                />
              </div>

              <div className="flex items-start gap-3.5 py-4 border-b border-border/15">
                <MessageSquare className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">Limite de interações por atendimento</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Defina a quantidade de interações que o agente pode aceitar por atendimento.</p>
                </div>
                <Select value={limiteInteracoes} onValueChange={setLimiteInteracoes}>
                  <SelectTrigger className="w-[140px] h-8 text-xs bg-background/50 border-border/40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_limite">Sem limite</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Business hours */}
              <div className="flex items-start gap-3.5 py-4 border-b border-border/15">
                <CalendarClock className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">Horários de funcionamento</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {businessHours.allowAnytime
                      ? "O agente responde em qualquer horário."
                      : `Configurado para ${Object.entries(businessHours.days).filter(([,v]) => v.enabled).length} dias da semana.`
                    }
                  </p>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-8 shrink-0" onClick={() => setShowBusinessHoursModal(true)}>
                  Configurar
                </Button>
              </div>
              <BusinessHoursModal
                open={showBusinessHoursModal}
                onClose={() => setShowBusinessHoursModal(false)}
                value={businessHours}
                onChange={setBusinessHours}
              />

              <div className="pt-5 flex justify-end">
                <Button size="sm" className="text-xs px-6" onClick={handleSaveConversa} disabled={updateAgent.isPending}>
                  {updateAgent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Salvar
                </Button>
              </div>
            </div>
          )}

          {/* ── Ações de inatividade ── */}
          {activeTab === "inatividade" && (
            <div className="space-y-4">
              <p className="text-[12px] text-primary/70 flex items-center gap-1.5 bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Configure ações que o agente deve executar quando o cliente parar de responder.
              </p>

              <div className="space-y-3">
                {inactivityRules.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10">
                    <Clock className="h-8 w-8 text-muted-foreground/15 mb-2" />
                    <p className="text-[12px] text-muted-foreground/50">Nenhuma regra configurada.</p>
                    <p className="text-[11px] text-muted-foreground/30 mt-0.5">Clique abaixo para criar.</p>
                  </div>
                )}
                {inactivityRules.map((rule, i) => (
                  <div key={rule.id} className="rounded-xl border border-border/20 overflow-hidden" style={{ background: 'hsl(var(--card))' }}>
                    {/* Rule header */}
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <Clock className="h-4 w-4 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
                      <span className="text-[13px] text-muted-foreground/70">Se não responder em</span>
                      <Select
                        value={String(rule.minutes)}
                        onValueChange={(v) => setInactivityRules(r => r.map((x, idx) => idx === i ? { ...x, minutes: Number(v) } : x))}
                      >
                        <SelectTrigger className="w-auto h-7 text-[12px] bg-transparent border-0 font-bold text-foreground px-1 gap-1 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 minutos</SelectItem>
                          <SelectItem value="5">5 minutos</SelectItem>
                          <SelectItem value="10">10 minutos</SelectItem>
                          <SelectItem value="15">15 minutos</SelectItem>
                          <SelectItem value="30">30 minutos</SelectItem>
                          <SelectItem value="60">1 hora</SelectItem>
                          <SelectItem value="120">2 horas</SelectItem>
                          <SelectItem value="240">4 horas</SelectItem>
                          <SelectItem value="480">8 horas</SelectItem>
                          <SelectItem value="1440">1 dia</SelectItem>
                          <SelectItem value="2880">2 dias</SelectItem>
                          <SelectItem value="4320">3 dias</SelectItem>
                          <SelectItem value="5760">4 dias</SelectItem>
                          <SelectItem value="7200">5 dias</SelectItem>
                          <SelectItem value="8640">6 dias</SelectItem>
                          <SelectItem value="10080">7 dias</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-[13px] text-muted-foreground/70">o agente deve</span>
                      <span className="text-[13px] font-bold text-foreground">
                        {rule.action === "finalizar" ? "Finalizar atendimento." : rule.action === "transferir" ? "Transferir para humano." : rule.action === "mensagem" ? "Interagir com cliente." : "Enviar mensagem."}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <Select
                          value={rule.action}
                          onValueChange={(v) => setInactivityRules(r => r.map((x, idx) => idx === i ? { ...x, action: v } : x))}
                        >
                          <SelectTrigger className="h-7 w-7 p-0 border-0 bg-transparent shadow-none [&>svg]:hidden justify-center">
                            <Settings className="h-3.5 w-3.5 text-muted-foreground/30 hover:text-foreground transition-colors" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="finalizar">Finalizar atendimento</SelectItem>
                            <SelectItem value="transferir">Transferir para humano</SelectItem>
                            <SelectItem value="mensagem">Interagir com cliente</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => setShowBusinessHoursModal(true)}
                          className="text-muted-foreground/30 hover:text-foreground transition-colors"
                          title="Horários de funcionamento"
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setInactivityRules(r => r.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground/25 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Message field */}
                    <div className="px-4 pb-3.5 space-y-1">
                      <p className="text-[11px] text-primary/60 ml-7">O que o agente deve falar?</p>
                      <div className="relative ml-7">
                        <CornerDownLeft className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/20" />
                        <input
                          value={rule.message || ""}
                          onChange={(e) => setInactivityRules(r => r.map((x, idx) => idx === i ? { ...x, message: e.target.value.slice(0, 512) } : x))}
                          placeholder={
                            rule.action === "mensagem"
                              ? "Perguntar se o cliente ainda está interessado"
                              : rule.action === "finalizar"
                              ? "Informar que o atendimento será encerrado"
                              : "Avisar que será transferido para um atendente"
                          }
                          className="w-full h-9 pl-8 pr-14 text-xs rounded-lg border border-border/20 bg-background/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] tabular-nums text-muted-foreground/25">
                          {(rule.message || "").length}/512
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setInactivityRules(r => [...r, { id: Date.now(), minutes: 2, action: "mensagem", message: "" }])}
                className="text-[12px] text-primary/80 hover:text-primary transition-colors flex items-center gap-1.5 mt-1"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar ação anterior
              </button>


              <div className="pt-2 flex justify-end">
                <Button size="sm" className="text-xs px-6" onClick={handleSaveInatividade} disabled={updateAgent.isPending}>
                  {updateAgent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Salvar
                </Button>
              </div>
            </div>
          )}

          {/* ── Webhooks ── */}
          {activeTab === "webhooks" && (
            <div className="space-y-4">
              <p className="text-[12px] text-primary/70 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Escute eventos que acontecem no sistema e tome ações como{" "}
                <span className="underline cursor-pointer">enviar um webhook</span>.
              </p>

              <button
                onClick={() => setWebhookRules(r => [...r, { id: Date.now(), event: "nova_mensagem", events: ["nova_mensagem"], url: "" }])}
                className="text-[12px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar novo evento
              </button>

              <div className="space-y-2">
                {webhookRules.length === 0 && (
                  <p className="text-[12px] text-muted-foreground/50 text-center py-6">Nenhum webhook configurado. Clique em "Adicionar novo evento" para criar.</p>
                )}
                {webhookRules.map((rule, i) => (
                  <div key={rule.id} className="flex items-center gap-3 p-4 rounded-xl border border-border/25 bg-background/40">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] text-muted-foreground/60">Tipo do evento:</span>
                      <Select
                        value={rule.event || rule.events?.[0] || ""}
                        onValueChange={(v) => setWebhookRules(r => r.map((x, idx) => idx === i ? { ...x, event: v } : x))}
                      >
                        <SelectTrigger className="w-[160px] h-8 text-xs bg-background/50 border-border/40 font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nova_mensagem">Nova mensagem</SelectItem>
                          <SelectItem value="nao_soube_responder">Não souber responder</SelectItem>
                          <SelectItem value="primeiro_atendimento">Primeiro atendimento</SelectItem>
                          <SelectItem value="iniciar_atendimento">Iniciar atendimento</SelectItem>
                          <SelectItem value="transferencia">Agente transferir para humano</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] text-muted-foreground/60">Ação:</span>
                      <div className="h-8 px-3 flex items-center rounded-md border border-border/40 bg-background/50 text-xs font-semibold text-foreground/70">
                        Enviar Webhook
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className="text-[10px] text-muted-foreground/60">URL:</span>
                      <Input
                        placeholder="Ex: https://"
                        value={rule.url}
                        onChange={(e) => setWebhookRules(r => r.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x))}
                        className="h-8 text-xs bg-background/50 border-border/40"
                      />
                    </div>
                    <button
                      onClick={() => setWebhookRules(r => r.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground/30 hover:text-destructive transition-colors shrink-0 mt-4"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex justify-end">
                <Button size="sm" className="text-xs px-6" onClick={handleSaveWebhooks} disabled={updateAgent.isPending}>
                  {updateAgent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Salvar
                </Button>
              </div>
            </div>
          )}

          {/* ── Regras de transferência ── */}
          {activeTab === "transferencia" && (
            <div className="space-y-4">
              <p className="text-[12px] text-primary/70 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Configure instruções para o agente fazer{" "}
                <span className="underline cursor-pointer">transferência</span>{" "}
                do atendimento.
              </p>

              <div className="space-y-3">
                {transferRules.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 px-4">
                    <div className="w-12 h-12 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center mb-3">
                      <GitBranch className="h-5 w-5 text-primary/40" />
                    </div>
                    <p className="text-[13px] text-muted-foreground/60 text-center">Nenhuma regra configurada.</p>
                    <p className="text-[11px] text-muted-foreground/35 text-center mt-0.5">Clique abaixo para criar sua primeira regra.</p>
                  </div>
                )}
                {transferRules.map((rule, i) => (
                  <motion.div
                    key={rule.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="group relative rounded-2xl border border-border/20 bg-gradient-to-br from-card/80 via-background/60 to-card/40 backdrop-blur-sm hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 overflow-hidden"
                  >
                    {/* Rule number header strip */}
                    <div className="flex items-center justify-between px-5 py-2.5 bg-muted/30 border-b border-border/10">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-[11px] font-semibold text-foreground/70">
                          Regra de transferência
                        </span>
                        {rule.targetType === "agente" && <Bot className="h-3.5 w-3.5 text-primary/50" />}
                        {rule.targetType === "humano" && <User className="h-3.5 w-3.5 text-primary/50" />}
                      </div>
                      <button
                        onClick={() => setTransferRules(r => r.filter((_, idx) => idx !== i))}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="p-5 space-y-5">
                      {/* Target + Instructions row */}
                      <div className="flex items-start gap-5">
                        {/* Target selectors */}
                        <div className="flex flex-col gap-2.5 shrink-0 min-w-[160px]">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Transferir para</span>
                          <Select
                            value={rule.targetType === "agente" ? "agente" : rule.targetType === "humano" || rule.targetType === "fila" ? "humano" : "agente"}
                            onValueChange={(v) => setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, targetType: v, targetAgentId: v === "agente" ? "todos" : "todos" } : x))}
                          >
                            <SelectTrigger className="w-full h-9 text-xs bg-background/80 border-border/30 font-semibold rounded-lg shadow-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="agente">
                                <span className="flex items-center gap-1.5"><Bot className="h-3 w-3" /> Um agente</span>
                              </SelectItem>
                              <SelectItem value="humano">
                                <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> Um humano</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          {rule.targetType === "agente" && (
                            <TransferTargetPicker
                              value={rule.targetAgentId || "todos"}
                              onChange={(v) => setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, targetAgentId: v } : x))}
                              type="agente"
                              items={[
                                { id: "todos", name: "Todos agentes", avatar: null },
                                ...otherActiveAgents.map(a => ({ id: a.id, name: a.name, avatar: a.avatar_url || null, subtitle: a.purpose || "Agente" })),
                              ]}
                            />
                          )}
                          {rule.targetType === "humano" && (
                            <TransferTargetPicker
                              value={rule.targetAgentId || "todos"}
                              onChange={(v) => setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, targetAgentId: v } : x))}
                              type="humano"
                              items={[
                                { id: "todos", name: "Selecione", avatar: null },
                                ...(teamMembers || []).map(m => ({ id: m.user_id, name: m.display_name || m.user_id, avatar: m.avatar_url || null, subtitle: "Membro" })),
                              ]}
                            />
                          )}
                        </div>

                        {/* Divider */}
                        <div className="w-px self-stretch bg-border/15 shrink-0" />

                        {/* Instructions */}
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Instruções</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground/30">{rule.instructions.length}/255</span>
                          </div>
                          <Textarea
                            placeholder="Quando o cliente quiser falar sobre tal assunto..."
                            value={rule.instructions}
                            onChange={(e) => setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, instructions: e.target.value.slice(0, 255) } : x))}
                            className="min-h-[90px] text-xs bg-background/60 border-border/25 resize-none rounded-lg placeholder:text-muted-foreground/30 focus:border-primary/30 focus:ring-primary/10 transition-colors"
                          />
                        </div>
                      </div>

                      {/* Separator */}
                      <div className="h-px bg-gradient-to-r from-transparent via-border/20 to-transparent" />

                      {/* Tags to auto-assign */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Etiquetas automáticas</span>
                        <div className="flex flex-wrap gap-2 items-center">
                          {(rule.tags || []).map((tag, ti) => {
                            const existingTag = allTags.find(t => t.name === tag);
                            return (
                              <span
                                key={ti}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold shadow-sm"
                                style={{ backgroundColor: existingTag?.color || 'hsl(var(--primary))' }}
                              >
                                {tag}
                                <button
                                  onClick={() => setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, tags: (x.tags || []).filter((_, tIdx) => tIdx !== ti) } : x))}
                                  className="hover:opacity-70 transition-opacity"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            );
                          })}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 border-dashed border-border/30 bg-background/60 hover:bg-primary/5 hover:border-primary/30 transition-all">
                                <Plus className="h-3 w-3" /> Etiqueta
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-2 bg-popover border-border z-50" align="start">
                              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                                {allTags.length === 0 && (
                                  <p className="text-[10px] text-muted-foreground/50 p-2 text-center">Nenhuma etiqueta criada</p>
                                )}
                                {allTags.filter(t => !(rule.tags || []).includes(t.name)).map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => {
                                      setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, tags: [...(x.tags || []), t.name] } : x));
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 text-left transition-colors"
                                  >
                                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                                    <span className="text-xs truncate">{t.name}</span>
                                  </button>
                                ))}
                              </div>
                              <div className="border-t border-border/20 mt-1 pt-1.5 flex flex-col gap-1.5">
                                <p className="text-[9px] text-muted-foreground/50 px-1">Criar nova etiqueta</p>
                                <div className="flex items-center gap-1.5">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        className="w-6 h-6 rounded-md border border-border/30 shrink-0 transition-transform hover:scale-110"
                                        style={{ backgroundColor: newTagColors[i] || '#6366f1' }}
                                      />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2 bg-popover border-border z-[60]" align="start" side="right">
                                      <div className="grid grid-cols-5 gap-1.5">
                                        {TAG_PREMIUM_COLORS.map(c => (
                                          <button
                                            key={c}
                                            onClick={() => setNewTagColors(prev => ({ ...prev, [i]: c }))}
                                            className="w-6 h-6 rounded-full transition-transform hover:scale-125 ring-offset-background"
                                            style={{
                                              backgroundColor: c,
                                              outline: (newTagColors[i] || '#6366f1') === c ? '2px solid hsl(var(--primary))' : 'none',
                                              outlineOffset: '2px'
                                            }}
                                          />
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  <Input
                                    placeholder="Nome e Enter..."
                                    className="h-7 text-[10px] bg-background/60 border-border/25 rounded-lg flex-1"
                                    onKeyDown={async (e) => {
                                      if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                                        e.preventDefault();
                                        const val = (e.target as HTMLInputElement).value.trim();
                                        const color = newTagColors[i] || '#6366f1';
                                        try {
                                          await createTag.mutateAsync({ name: val, color });
                                        } catch {
                                          // Tag may already exist, ignore
                                        }
                                        if (!(rule.tags || []).includes(val)) {
                                          setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, tags: [...(x.tags || []), val] } : x));
                                        }
                                        (e.target as HTMLInputElement).value = "";
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <p className="text-[9px] text-muted-foreground/40">Etiquetas adicionadas automaticamente ao transferir</p>
                      </div>

                      {/* Separator */}
                      <div className="h-px bg-gradient-to-r from-transparent via-border/20 to-transparent" />

                      {/* Checkboxes - premium style */}
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2.5 cursor-pointer group/check">
                          <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${rule.returnOnFinish ? 'bg-primary border-primary' : 'border-border/40 hover:border-primary/40'}`}>
                            {rule.returnOnFinish && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </div>
                          <input
                            type="checkbox"
                            checked={rule.returnOnFinish}
                            onChange={(e) => setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, returnOnFinish: e.target.checked } : x))}
                            className="sr-only"
                          />
                          <span className="text-[11px] text-muted-foreground/70 group-hover/check:text-foreground/80 transition-colors">Devolver ao finalizar</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer group/check">
                          <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${rule.silentTransfer ? 'bg-primary border-primary' : 'border-border/40 hover:border-primary/40'}`}>
                            {rule.silentTransfer && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </div>
                          <input
                            type="checkbox"
                            checked={rule.silentTransfer}
                            onChange={(e) => setTransferRules(r => r.map((x, idx) => idx === i ? { ...x, silentTransfer: e.target.checked } : x))}
                            className="sr-only"
                          />
                          <span className="text-[11px] text-muted-foreground/70 group-hover/check:text-foreground/80 transition-colors">Não informar quando transferir</span>
                        </label>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={() => setTransferRules(r => [...r, { id: Date.now(), targetType: "agente", targetAgentId: "todos", instructions: "", returnOnFinish: false, silentTransfer: false, tags: [] }])}
                className="text-[12px] text-primary/80 hover:text-primary transition-colors flex items-center gap-1.5 mt-1"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar regra de transferência
              </button>

              <div className="pt-2 flex justify-end">
                <Button size="sm" className="text-xs px-6" onClick={handleSaveTransferencia} disabled={updateAgent.isPending}>
                  {updateAgent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Salvar
                </Button>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}

interface Props {
  agent: Agent;
  onBack: () => void;
  onSave: (agent: Agent) => void;
  initialSection?: Section;
  onSectionChange?: (section: string) => void;
}

export function AgentEditor({ agent, onBack, onSave, initialSection = "perfil", onSectionChange }: Props) {
  const { t } = useLanguage();
  // Load enabled models from DB only — no hardcoded fallback
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  useEffect(() => {
    supabase
      .from("ai_models")
      .select("model_id, display_name")
      .eq("is_enabled", true)
      .order("display_name")
      .then(({ data }) => {
        const modelsData = (data || []) as Array<{ model_id: string; display_name: string }>;
        setModels(modelsData.map((m) => ({ value: m.model_id, label: m.display_name })));
        setModelsLoaded(true);
      });
  }, []);
  const updateAgent = useUpdateAgent();
  const queryClient = useQueryClient();
  const { connections, isLoading: connectionsLoading } = useEvolutionApi();
  const { connections: telegramConns, isLoading: telegramLoading } = useTelegramConnections();
  const { connections: clinicorpConns, addConnection: addClinicorp, deleteConnection: deleteClinicorp } = useClinicorpConnections();
  const { connections: solarMarketConns, addConnection: addSolarMarket, deleteConnection: deleteSolarMarket } = useSolarMarketConnections();
   const [clinicorpModalOpen, setClinicorpModalOpen] = useState(false);
   const { connections: widgetConns, isLoading: widgetLoading } = useWidgetConnections();
  const [solarMarketModalOpen, setSolarMarketModalOpen] = useState(false);
  const [solarMarketConfigModalOpen, setSolarMarketConfigModalOpen] = useState(false);
  const [googleCalendarWizardOpen, setGoogleCalendarWizardOpen] = useState(false);
  const { connections: gcalConnections } = useGoogleCalendarConnections();
  const [clinicorpApiKey, setClinicorpApiKey] = useState("");
  const [clinicorpClinicId, setClinicorpClinicId] = useState("");
  const [solarMarketApiKey, setSolarMarketApiKey] = useState("");
  const [solarMarketCompanyName, setSolarMarketCompanyName] = useState("");
  const [elevenLabsModalOpen, setElevenLabsModalOpen] = useState(false);
  const [elevenLabsConfigModalOpen, setElevenLabsConfigModalOpen] = useState(false);
  const [elevenLabsTempKey, setElevenLabsTempKey] = useState("");
  const [elevenLabsSavingKey, setElevenLabsSavingKey] = useState(false);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<{ voice_id: string; name: string; category?: string; labels?: Record<string, unknown>; preview_url?: string }[]>([]);
  const [elevenLabsLoadingVoices, setElevenLabsLoadingVoices] = useState(false);
  const [elevenLabsSavingConfig, setElevenLabsSavingConfig] = useState(false);
  const [elevenLabsTesting, setElevenLabsTesting] = useState(false);
  const [clinicorpClinicName, setClinicorpClinicName] = useState("");
  const [activeSection, setActiveSection] = useState<Section>(initialSection);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(agent.avatar_url);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: agent.name,
    instructions: agent.instructions,
    model: agent.model,
    temperature: agent.temperature,
    conversation_starters: agent.conversation_starters ?? [],
    connection_id: agent.connection_id ?? null as string | null,
    telegram_connection_id: agent.telegram_connection_id ?? null as string | null,
    // Trabalho
    purpose: agent.purpose ?? "vendas",
    communication_style: agent.communication_style ?? "normal",
    product_name: agent.product_name ?? "",
    official_site: agent.official_site ?? "",
    product_description: agent.product_description ?? "",
    // Prompt
    prompt_o_que_fazer: agent.prompt_o_que_fazer ?? "",
    prompt_como_pergunta: agent.prompt_como_pergunta ?? "",
    prompt_nao_fazer: agent.prompt_nao_fazer ?? "",
  });

  const [elevenLabsConfig, setElevenLabsConfig] = useState({
    elevenlabs_api_key: agent.elevenlabs_api_key ?? null as string | null,
    elevenlabs_voice_id: agent.elevenlabs_voice_id ?? "iP95p4xoKVk53GoZ742B",
    elevenlabs_model: agent.elevenlabs_model ?? "eleven_multilingual_v2",
    elevenlabs_enabled: agent.elevenlabs_enabled ?? false,
    elevenlabs_always_audio: agent.elevenlabs_always_audio ?? false,
    elevenlabs_audio_on_audio: agent.elevenlabs_audio_on_audio ?? true,
    elevenlabs_stability: Number(agent.elevenlabs_stability ?? 0.5),
    elevenlabs_similarity: Number(agent.elevenlabs_similarity ?? 0.75),
    elevenlabs_style: Number(agent.elevenlabs_style ?? 0.5),
    elevenlabs_speed: Number(agent.elevenlabs_speed ?? 1.0),
    elevenlabs_speaker_boost: agent.elevenlabs_speaker_boost ?? true,
  });

  // Sync local convenience states to form (these now come from form)
  const communicationStyle = form.communication_style;
  const setCommunicationStyle = (v: string) => setForm(f => ({ ...f, communication_style: v }));
  const purpose = form.purpose;
  const setPurpose = (v: string) => setForm(f => ({ ...f, purpose: v }));
  const productName = form.product_name;
  const setProductName = (v: string) => setForm(f => ({ ...f, product_name: v }));
  const officialSite = form.official_site;
  const setOfficialSite = (v: string) => setForm(f => ({ ...f, official_site: v }));
  const productDescription = form.product_description;
  const setProductDescription = (v: string) => setForm(f => ({ ...f, product_description: v }));
  const promptOQueFazer = form.prompt_o_que_fazer;
  const setPromptOQueFazer = (fn: string | ((v: string) => string)) => setForm(f => ({ ...f, prompt_o_que_fazer: typeof fn === "string" ? fn : fn(f.prompt_o_que_fazer) }));
  const promptComoPergunta = form.prompt_como_pergunta;
  const setPromptComoPergunta = (fn: string | ((v: string) => string)) => setForm(f => ({ ...f, prompt_como_pergunta: typeof fn === "string" ? fn : fn(f.prompt_como_pergunta) }));
  const promptNaoFazer = form.prompt_nao_fazer;
  const setPromptNaoFazer = (fn: string | ((v: string) => string)) => setForm(f => ({ ...f, prompt_nao_fazer: typeof fn === "string" ? fn : fn(f.prompt_nao_fazer) }));

  const [showPromptComoPergunta, setShowPromptComoPergunta] = useState(!!agent.prompt_como_pergunta);
  const [showPromptNaoFazer, setShowPromptNaoFazer] = useState(!!agent.prompt_nao_fazer);
  const [starterInput, setStarterInput] = useState("");
  const [showTestChat, setShowTestChat] = useState(false);
  const handleSave = async () => {
    const payload = {
      id: agent.id,
      name: form.name,
      instructions: form.instructions,
      model: form.model,
      temperature: form.temperature,
      conversation_starters: form.conversation_starters,
      connection_id: form.connection_id,
      telegram_connection_id: form.telegram_connection_id,
      avatar_url: avatarUrl,
      purpose: form.purpose,
      communication_style: form.communication_style,
      product_name: form.product_name,
      official_site: form.official_site,
      product_description: form.product_description,
      prompt_o_que_fazer: form.prompt_o_que_fazer,
      prompt_como_pergunta: form.prompt_como_pergunta,
      prompt_nao_fazer: form.prompt_nao_fazer,
    };
    updateAgent.mutate(payload, {
      onSuccess: (data) => { onSave(data); toast.success("Agente salvo com sucesso!"); },
      onError: () => toast.error("Erro ao salvar agente"),
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 2MB.");
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `agent-avatars/${agent.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(publicUrl);
      await supabase.from("agents").update({ avatar_url: publicUrl }).eq("id", agent.id);
      toast.success("Foto atualizada!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Erro ao fazer upload: " + message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const addStarter = () => {
    if (starterInput.trim()) {
      setForm(f => ({ ...f, conversation_starters: [...f.conversation_starters, starterInput.trim()] }));
      setStarterInput("");
    }
  };

  const removeStarter = (i: number) => {
    setForm(f => ({ ...f, conversation_starters: f.conversation_starters.filter((_, idx) => idx !== i) }));
  };

  const charCount = form.instructions.length;
  const productDescCount = form.product_description.length;
  const currentModel = models.find(m => m.value === form.model);
  // True if models finished loading and the agent's saved model isn't in the enabled list
  const isModelInvalid = modelsLoaded && models.length > 0 && !currentModel;

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-[calc(100vh-2rem)] -mx-6 -mt-6 overflow-hidden relative pl-1">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Left sidebar ── */}
      <div className={`w-[220px] flex-shrink-0 flex flex-col border-r border-border/15 bg-card/30 backdrop-blur-xl
        fixed lg:relative inset-y-0 left-0 z-40 transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>

        {/* Back */}
        <div className="px-4 pt-5 pb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
        </div>

        {/* Agent avatar + name */}
        <div className="px-4 pb-5 flex flex-col items-center text-center gap-2">
          {/* Avatar with upload */}
          <div className="relative group">
            <div
              className="h-[80px] w-[80px] rounded-full bg-secondary/60 border-2 border-border/30 flex items-center justify-center overflow-hidden cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <Loader2 className="h-6 w-6 text-muted-foreground/40 animate-spin" />
              ) : avatarUrl ? (
                <img src={avatarUrl} alt={form.name} className="h-full w-full object-cover" />
              ) : (
                <Bot className="h-9 w-9 text-muted-foreground/40" strokeWidth={1.5} />
              )}
              {/* Overlay on hover */}
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Pencil className="h-4 w-4 text-white" />
              </div>
            </div>
            <div
              className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-primary flex items-center justify-center border-2 border-card cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Pencil className="h-2.5 w-2.5 text-primary-foreground" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          <div className="space-y-0.5">
            <p className="text-[13px] font-semibold leading-tight">{form.name || "Novo Agente"}</p>
            {productName && (
              <p className="text-[11px] text-muted-foreground/50 leading-tight">
                {purpose === "vendas" ? t("agents.roleSeller") : purpose === "suporte" ? t("agents.roleSupport") : t("agents.roleAssistant")} {productName}
              </p>
            )}
          </div>

          {/* Model selector */}
          <div className="relative w-full mt-1 space-y-1">
            <button
              onClick={() => setShowModelModal(true)}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors text-[11px] ${
                isModelInvalid
                  ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "border-border/30 bg-secondary/30 text-muted-foreground/70 hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              {!modelsLoaded ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isModelInvalid ? (
                <>
                  <span className="truncate max-w-[130px]">Modelo inválido</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{currentModel?.label ?? "Selecionar modelo"}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </>
              )}
            </button>
            {isModelInvalid && (
              <p className="text-[10px] text-destructive/70 text-center leading-tight px-1">
                Este modelo foi desabilitado. Selecione outro.
              </p>
            )}
            <ModelSelectorModal
              open={showModelModal}
              onClose={() => setShowModelModal(false)}
              currentModel={form.model}
              onSave={(model) => {
                setForm(f => ({ ...f, model }));
                updateAgent.mutate({ id: agent.id, model }, {
                  onSuccess: () => toast.success("Modelo salvo com sucesso"),
                  onError: () => toast.error("Erro ao salvar modelo"),
                });
              }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border/15 mx-3 mb-3" />

        {/* Nav items */}
        <nav className="px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ key, label, icon: Icon }) => {
            const isActive = activeSection === key;
            return (
              <button
                key={key}
                onClick={() => { setActiveSection(key); onSectionChange?.(key); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150 group ${
                  isActive
                    ? "bg-foreground/8 text-foreground"
                    : "text-muted-foreground/60 hover:text-foreground/80 hover:bg-foreground/5"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-foreground/60"
                  }`}
                  strokeWidth={1.5}
                />
                <span className="text-[13px] font-medium leading-tight">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shrink-0"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Teste sua IA button */}
        <div className="px-2" style={{ marginTop: 45 }}>
          <button
            onClick={() => setShowTestChat(!showTestChat)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 ${
              showTestChat
                ? "bg-primary/20 border border-primary/30 text-primary"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Teste sua IA
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Top bar with section title + save */}
           <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-8 py-4 border-b border-border/15 bg-background/80 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 -ml-1 rounded-lg hover:bg-secondary/30 text-muted-foreground">
                <Menu className="h-5 w-5" />
              </button>
              <h2 className="text-[15px] font-semibold leading-tight">
                {activeSection === "perfil" && "Informações pessoais"}
                {activeSection === "prompt" && "Prompt do agente"}
                {activeSection === "trabalho" && "Informações sobre trabalho"}
                {activeSection === "treinamentos" && "Treinamentos"}
                {activeSection === "intencoes" && "Intenções"}
                {activeSection === "integracoes" && "Integrações"}
                {activeSection === "voz" && "Voz"}
                {activeSection === "servidores-mcp" && "Servidores MCP"}
                {activeSection === "canais" && "Canais de atendimento"}
                {activeSection === "configuracoes" && "Configurações"}
              </h2>
              {(activeSection === "treinamentos") && (
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">Visualize informações, faça treinamentos, ative integrações ou conecte os canais de atendimento</p>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={updateAgent.isPending}
              size="sm"
              className="gap-1.5 text-xs h-8"
            >
              {updateAgent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {updateAgent.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>

          {/* Section content */}
          <div className="px-4 sm:px-8 py-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >

                {/* ── PROMPT ── */}
                {activeSection === "prompt" && (
                  <div className="space-y-8">
                    {/* Templates */}
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground/50">Clique em um template para preencher os campos abaixo. Você pode editar depois.</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { label: "Vendas", desc: "Qualificar leads e fechar vendas" },
                          { label: "Suporte", desc: "Resolver problemas e dúvidas" },
                          { label: "Assistente", desc: "Assistente para uso pessoal" },
                          { label: "Agendamento", desc: "Agendar e gerenciar compromissos" },
                          { label: "E-commerce", desc: "Catálogo, vendas e entregas" },
                          { label: "Imobiliária", desc: "Imóveis, visitas e corretores" },
                        ].map(t => (
                          <button
                            key={t.label}
                            onClick={() => {
                              if (t.label === "Vendas") {
                                setPromptOQueFazer("- Apresentar os produtos/serviços da empresa de forma clara e objetiva\n- Identificar a necessidade do cliente e sugerir a melhor opção\n- Coletar nome, telefone e e-mail do lead interessado\n- Informar preços, condições de pagamento e prazos\n- Encaminhar para fechamento quando o cliente demonstrar interesse\n- Enviar link de pagamento ou agendar reunião com vendedor");
                                setPromptComoPergunta("- Comece perguntando como pode ajudar, de forma natural\n- Pergunte o nome do cliente logo no início\n- Faça uma pergunta por vez, nunca várias juntas\n- Descubra a necessidade antes de oferecer qualquer produto\n- Use perguntas abertas: \"O que você está buscando?\" em vez de \"Quer o produto X?\"\n- Confirme o entendimento antes de seguir: \"Entendi, então você precisa de...\"");
                                setPromptNaoFazer("- Nunca inventar preços, prazos ou condições que não existem\n- Não falar mal de concorrentes ou comparar diretamente\n- Não ser insistente ou pressionar o cliente a comprar\n- Nunca compartilhar dados de outros clientes\n- Não dar descontos sem autorização prévia\n- Nunca dizer que é uma IA, robô ou assistente virtual");
                              } else if (t.label === "Suporte") {
                                setPromptOQueFazer("- Ouvir e entender o problema relatado pelo cliente\n- Confirmar os dados do cliente antes de prosseguir\n- Oferecer soluções claras e passo a passo\n- Escalar para humano quando necessário\n- Registrar o ticket do atendimento");
                                setPromptComoPergunta("- Pergunte qual é o problema de forma empática\n- Confirme o entendimento antes de responder\n- Faça uma pergunta por vez\n- Use linguagem simples e acessível");
                                setPromptNaoFazer("- Nunca prometer soluções que não pode garantir\n- Não deixar o cliente sem resposta por mais de 2 turnos\n- Não usar jargões técnicos sem explicação\n- Nunca minimizar o problema do cliente");
                              } else if (t.label === "Assistente") {
                                setPromptOQueFazer("- Ajudar com tarefas do dia a dia\n- Organizar informações e lembretes\n- Responder perguntas gerais com clareza\n- Sugerir soluções criativas e práticas");
                                setPromptComoPergunta("- Pergunte o que o usuário precisa de forma direta\n- Confirme a tarefa antes de executar\n- Ofereça opções quando houver mais de uma abordagem");
                                setPromptNaoFazer("- Não executar ações irreversíveis sem confirmação\n- Não compartilhar informações pessoais\n- Nunca assumir intenções sem confirmar");
                              }
                            }}
                            className="flex flex-col items-start gap-1 p-3 rounded-xl border border-border/25 bg-background/40 hover:bg-secondary/40 hover:border-border/50 transition-all text-left"
                          >
                            <span className="text-[12px] font-semibold text-foreground/80">{t.label}</span>
                            <span className="text-[10px] text-muted-foreground/50 leading-snug">{t.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* O que deve fazer */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={2} />
                        <Label className="text-[13px] font-semibold text-foreground">O que ele deve fazer</Label>
                      </div>
                      <p className="text-[11px] text-primary/60 ml-6">Descreva claramente a função do agente, o que ele deve responder e como deve agir.</p>
                      <div className="relative ml-6">
                        <Textarea
                          value={promptOQueFazer}
                          onChange={e => setPromptOQueFazer(e.target.value.slice(0, 2000))}
                          rows={8}
                          maxLength={2000}
                          className="bg-background/50 border-border/40 resize-none leading-relaxed text-[13px]"
                          placeholder={"- Apresentar os produtos/serviços de forma clara\n- Identificar a necessidade do cliente\n- Coletar nome e contato do lead interessado"}
                        />
                        <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/40">{promptOQueFazer.length}/2000</span>
                      </div>
                    </div>

                    {/* Como deve fazer as perguntas */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-primary shrink-0" strokeWidth={1.5} />
                          <Label className="text-[13px] font-semibold text-foreground">Como deve fazer as perguntas</Label>
                        </div>
                        <Switch checked={showPromptComoPergunta} onCheckedChange={(checked) => {
                          setShowPromptComoPergunta(checked);
                          if (!checked) setPromptComoPergunta("");
                        }} />
                      </div>
                      {showPromptComoPergunta && (
                        <>
                          <p className="text-[11px] text-primary/60 ml-6">Defina o tom, a sequência e o estilo das perguntas que o agente faz ao usuário.</p>
                          <div className="relative ml-6">
                            <Textarea
                              value={promptComoPergunta}
                              onChange={e => setPromptComoPergunta(e.target.value.slice(0, 2000))}
                              rows={8}
                              maxLength={2000}
                              className="bg-background/50 border-border/40 resize-none leading-relaxed text-[13px]"
                              placeholder={"- Comece perguntando como pode ajudar, de forma natural\n- Faça uma pergunta por vez, nunca várias juntas\n- Descubra a necessidade antes de oferecer qualquer produto"}
                            />
                            <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/40">{promptComoPergunta.length}/2000</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* O que NÃO deve fazer */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <X className="h-4 w-4 text-destructive shrink-0" strokeWidth={2} />
                          <Label className="text-[13px] font-semibold text-foreground">O que NÃO deve fazer</Label>
                        </div>
                        <Switch checked={showPromptNaoFazer} onCheckedChange={(checked) => {
                          setShowPromptNaoFazer(checked);
                          if (!checked) setPromptNaoFazer("");
                        }} />
                      </div>
                      {showPromptNaoFazer && (
                        <>
                          <p className="text-[11px] text-destructive/60 ml-6">Liste restrições, proibições e comportamentos que o agente deve evitar a todo custo.</p>
                          <div className="relative ml-6">
                            <Textarea
                              value={promptNaoFazer}
                              onChange={e => setPromptNaoFazer(e.target.value.slice(0, 2000))}
                              rows={8}
                              maxLength={2000}
                              className="bg-background/50 border-border/40 resize-none leading-relaxed text-[13px]"
                              placeholder={"- Nunca inventar preços ou condições que não existem\n- Não falar mal de concorrentes\n- Nunca dizer que é uma IA ou robô"}
                            />
                            <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/40">{promptNaoFazer.length}/2000</span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSave} disabled={updateAgent.isPending} size="sm" className="gap-1.5 text-xs h-8 px-6">
                        {updateAgent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar prompt
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── PERFIL ── */}
                {activeSection === "perfil" && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Nome do agente</Label>
                        <Input
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          className="bg-background/50 border-border/40"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Comunicação</Label>
                        <div className="flex gap-0 rounded-lg overflow-hidden border border-border/40">
                          {communicationStyles.map(style => (
                            <button
                              key={style.value}
                              onClick={() => setCommunicationStyle(style.value)}
                              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                                communicationStyle === style.value
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background/50 text-muted-foreground hover:bg-accent/40"
                              }`}
                            >
                              {style.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Comportamento:</Label>
                      </div>
                      <p className="text-[11px] text-primary/60">Descreva um pouco sobre como o agente deve se comportar durante a conversa.</p>
                      <div className="relative">
                        <Textarea
                          value={form.instructions}
                          onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                          rows={12}
                          maxLength={3000}
                          className="bg-background/50 border-border/40 resize-none leading-relaxed"
                          placeholder="Descreva o estilo de comunicação, personalidade e diretrizes do agente..."
                        />
                        <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/50">{charCount}/3000</span>
                      </div>
                    </div>

                  </div>
                )}

                {/* ── TRABALHO ── */}
                {activeSection === "trabalho" && (
                  <div className="space-y-8">
                    {/* Finalidade */}
                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground">Finalidade:</Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {purposeOptions.map(opt => {
                          const Icon = opt.icon;
                          const isActive = purpose === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setPurpose(opt.value)}
                              className={`flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all ${
                                isActive
                                  ? "bg-primary/10 border-primary/40 text-foreground"
                                  : "bg-background/50 border-border/30 text-muted-foreground hover:border-border/60"
                              }`}
                            >
                              <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground/50"}`} strokeWidth={1.5} />
                              <div>
                                <p className="text-sm font-semibold">{opt.label}</p>
                                <p className="text-[10px] leading-tight opacity-60 mt-0.5">{opt.description}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Produto + site */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          {purpose === "vendas" ? "Vende o produto:" : purpose === "suporte" ? "Produto / Serviço:" : "Contexto:"}
                        </Label>
                        <div className="relative">
                          <Input
                            value={productName}
                             onChange={e => setProductName(e.target.value.slice(0, 50))}
                            placeholder={purpose === "vendas" ? "Ex: Apolinario Filho" : "Ex: Meu produto"}
                            className="bg-background/50 border-border/40"
                            maxLength={50}
                          />
                          <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/40">{productName.length}/50</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Site oficial: <span className="text-muted-foreground/40">(opcional)</span></Label>
                        <Input
                          value={officialSite}
                          onChange={e => setOfficialSite(e.target.value)}
                          placeholder="https://exemplo.com.br"
                          className="bg-background/50 border-border/40"
                          type="url"
                        />
                      </div>
                    </div>

                    {/* Descrição do produto */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Descreva um pouco sobre {productName || "o produto"}:
                      </Label>
                      <div className="relative">
                         <Textarea
                          value={productDescription}
                          onChange={e => setProductDescription(e.target.value.slice(0, 500))}
                          rows={8}
                          maxLength={500}
                          className="bg-background/50 border-border/40 resize-none leading-relaxed"
                          placeholder="Descreva o produto, seus diferenciais, público-alvo e objetivos..."
                        />
                        <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/50">{productDescCount}/500</span>
                      </div>
                    </div>

                    {/* Criatividade */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Criatividade (Temperature)</Label>
                        <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{form.temperature.toFixed(1)}</span>
                      </div>
                      <Slider
                        value={[form.temperature]}
                        onValueChange={([v]) => setForm(f => ({ ...f, temperature: v }))}
                        min={0}
                        max={2}
                        step={0.1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground/50">
                        <span>Preciso</span>
                        <span>Criativo</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TREINAMENTOS ── */}
                {activeSection === "treinamentos" && (
                  <div className="space-y-6">
                    <AgentKnowledgeSection agentId={agent.id} />
                  </div>
                )}

                {/* ── INTENÇÕES ── */}
                {activeSection === "intencoes" && (
                  <div className="space-y-6">
                    <p className="text-sm text-muted-foreground">As intenções do agente são configuradas através das <strong>Regras de Transferência</strong> na aba Configurações e dos <strong>Prompts</strong> na aba Prompt.</p>
                    <div className="glass-card rounded-xl p-8 flex flex-col items-center gap-3 text-center">
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Target className="h-7 w-7 text-primary/50" strokeWidth={1.5} />
                      </div>
                      <p className="text-sm text-foreground/80 font-medium">Gerencie intenções nos Prompts e Configurações</p>
                      <p className="text-xs text-muted-foreground/50 max-w-sm">Use a aba <strong>Prompt</strong> para definir o que o agente deve fazer, e a aba <strong>Configurações → Regras de transferência</strong> para configurar ações automáticas baseadas em intenções.</p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { setActiveSection("prompt"); onSectionChange?.("prompt"); }}>
                          <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Ir para Prompt
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { setActiveSection("configuracoes"); onSectionChange?.("configuracoes"); }}>
                          <Settings className="h-3.5 w-3.5 mr-1.5" /> Ir para Configurações
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── INTEGRAÇÕES ── */}
                {activeSection === "integracoes" && (
                  <div className="space-y-5">
                    <p className="text-[13px] text-muted-foreground/70 leading-relaxed">
                      Conecte o seu agente a outros aplicativos, isso permite que ele obtenha informações mais precisas ou agende reuniões para você.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[
                        {
                          logo: elevenLabsLogo,
                          name: "ElevenLabs",
                          description: "Com ElevenLabs você dá a capacidade do seu agente responder seus clientes em áudio, tornando ainda mais humanizado.",
                          configured: !!elevenLabsConfig.elevenlabs_api_key,
                          cta: elevenLabsConfig.elevenlabs_api_key ? "Integração Ativa ✓" : "Configurar Integração",
                          ctaVariant: elevenLabsConfig.elevenlabs_api_key ? "secondary" as const : "default" as const,
                        },
                        {
                          logo: googleCalendarLogo,
                          name: "Google Calendar",
                          description: gcalConnections.length > 0
                            ? `Conectado: ${gcalConnections[0].display_name}. O agente pode agendar reuniões e consultar horários.`
                            : "Com google calendar sua agente sera capaz de agendar reuniões, criar link da chamada e já enviar os convites.",
                          configured: gcalConnections.length > 0,
                          cta: gcalConnections.length > 0 ? "Configurar Integração" : "Ativar Integração",
                          ctaVariant: gcalConnections.length > 0 ? "secondary" as const : "default" as const,
                        },
                        {
                          logo: clinicorpLogo,
                          name: "Clinicorp",
                          description: clinicorpConns.length > 0
                            ? `Conectado: ${clinicorpConns[0].clinic_name || clinicorpConns[0].clinic_id}. O agente pode consultar agendamentos e pacientes em tempo real.`
                            : "Conecte seu Clinicorp para que o agente consulte agendamentos, pacientes e procedimentos em tempo real.",
                          configured: clinicorpConns.length > 0,
                          cta: clinicorpConns.length > 0 ? "Integração Ativa ✓" : "Conectar Clinicorp",
                          ctaVariant: clinicorpConns.length > 0 ? "secondary" as const : "default" as const,
                        },
                        {
                          logo: solarMarketLogo,
                          name: "Solar Market",
                          description: solarMarketConns.length > 0
                            ? `Conectado: ${solarMarketConns[0].company_name || "Empresa"}.`
                            : "Conecte a Solar Market para que o agente consulte leads, propostas comerciais e produtos de energia solar.",
                          configured: solarMarketConns.length > 0,
                          cta: solarMarketConns.length > 0 ? "Configurar Integração" : "Conectar Solar Market",
                          ctaVariant: solarMarketConns.length > 0 ? "secondary" as const : "default" as const,
                        },
                      ].map((integration, i) => (
                        <motion.div
                          key={integration.name}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06, duration: 0.2 }}
                          className="flex flex-col items-center gap-3 p-5 rounded-2xl border border-border/20 bg-card/40 hover:border-border/40 hover:bg-card/60 transition-all text-center"
                        >
                          {/* Logo */}
                          <div className="h-14 w-14 flex items-center justify-center">
                            <img src={integration.logo} alt={integration.name} className="h-12 w-12 object-contain rounded-xl" />
                          </div>

                          {/* Name */}
                          <h3 className="text-[13px] font-semibold text-foreground">{integration.name}</h3>

                          {/* Description */}
                          <p className="text-[11px] text-muted-foreground/60 leading-relaxed flex-1">{integration.description}</p>

                          {/* Features list */}
                          {"features" in integration && integration.features && (
                            <ul className="w-full text-left space-y-1 mt-1">
                              {(integration.features as string[]).map((feat: string) => (
                                <li key={feat} className="text-[11px] text-muted-foreground/50 flex items-center gap-1.5">
                                  <span className="h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                                  {feat}
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* CTA Button */}
                          <Button
                            size="sm"
                            variant={integration.ctaVariant}
                            className={`w-full text-xs font-semibold mt-1 ${
                              integration.ctaVariant === "default"
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-secondary/60 text-muted-foreground hover:bg-secondary border border-border/30"
                            }`}
                            onClick={() => {
                              if (integration.name === "Clinicorp") {
                                if (clinicorpConns.length > 0) {
                                  toast.info("Clinicorp já conectado. Gerencie em Integrações.");
                                } else {
                                  setClinicorpModalOpen(true);
                                }
                              } else if (integration.name === "ElevenLabs") {
                                if (elevenLabsConfig.elevenlabs_api_key) {
                                  // Open config modal and fetch voices
                                  setElevenLabsConfigModalOpen(true);
                                  if (elevenLabsVoices.length === 0) {
                                    setElevenLabsLoadingVoices(true);
                                    supabase.functions.invoke("elevenlabs-tts", {
                                      body: { action: "list_voices", agent_id: agent.id }
                                    }).then(({ data, error }) => {
                                      if (data?.voices) setElevenLabsVoices(data.voices);
                                      setElevenLabsLoadingVoices(false);
                                    }).catch(() => setElevenLabsLoadingVoices(false));
                                  }
                                } else {
                                  setElevenLabsModalOpen(true);
                                }
                              } else if (integration.name === "Google Calendar") {
                                setGoogleCalendarWizardOpen(true);
                              } else if (integration.name === "Solar Market") {
                                if (solarMarketConns.length > 0) {
                                  setSolarMarketConfigModalOpen(true);
                                } else {
                                  setSolarMarketModalOpen(true);
                                }
                              } else {
                                toast.info(`${integration.name}: em breve!`);
                              }
                            }}
                          >
                            {integration.cta}
                          </Button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── MODAL CLINICORP ── */}
                <Dialog open={clinicorpModalOpen} onOpenChange={setClinicorpModalOpen}>
                  <DialogContent className="max-w-md bg-card border-border/50">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-base">
                        <img src={clinicorpLogo} alt="Clinicorp" className="h-6 w-6 object-contain" />
                        Conectar Clinicorp
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Nome da clínica</Label>
                        <Input
                          value={clinicorpClinicName}
                          onChange={e => setClinicorpClinicName(e.target.value)}
                          placeholder="Ex: Clínica Sorriso"
                          className="bg-background/50 border-border/40 h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Clinic ID</Label>
                        <Input
                          value={clinicorpClinicId}
                          onChange={e => setClinicorpClinicId(e.target.value)}
                          placeholder="Ex: 12345"
                          className="bg-background/50 border-border/40 h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Chave de API</Label>
                        <Input
                          value={clinicorpApiKey}
                          onChange={e => setClinicorpApiKey(e.target.value)}
                          placeholder="sk-..."
                          type="password"
                          className="bg-background/50 border-border/40 h-9 text-sm"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => setClinicorpModalOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={!clinicorpApiKey.trim() || !clinicorpClinicId.trim() || addClinicorp.isPending}
                          onClick={() => {
                            addClinicorp.mutate(
                              { clinicId: clinicorpClinicId.trim(), apiKey: clinicorpApiKey.trim(), clinicName: clinicorpClinicName.trim() || undefined },
                              {
                                onSuccess: () => {
                                  setClinicorpApiKey("");
                                  setClinicorpClinicId("");
                                  setClinicorpClinicName("");
                                  setClinicorpModalOpen(false);
                                },
                              }
                            );
                          }}
                        >
                          {addClinicorp.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                          Conectar
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* ── MODAL SOLAR MARKET ── */}
                <Dialog open={solarMarketModalOpen} onOpenChange={setSolarMarketModalOpen}>
                  <DialogContent className="max-w-md bg-card border-border/50">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-base">
                        <img src={solarMarketLogo} alt="Solar Market" className="h-6 object-contain" />
                        Conectar Solar Market
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Nome da empresa</Label>
                        <Input
                          value={solarMarketCompanyName}
                          onChange={e => setSolarMarketCompanyName(e.target.value)}
                          placeholder="Ex: Solar Energy Ltda"
                          className="bg-background/50 border-border/40 h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Chave de API</Label>
                        <Input
                          value={solarMarketApiKey}
                          onChange={e => setSolarMarketApiKey(e.target.value)}
                          placeholder="sk-..."
                          type="password"
                          className="bg-background/50 border-border/40 h-9 text-sm"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground/50">
                        Obtenha sua chave de API em{" "}
                        <a href="https://www.solarmarket.com.br/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          solarmarket.com.br
                        </a>
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => setSolarMarketModalOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={!solarMarketApiKey.trim() || addSolarMarket.isPending}
                          onClick={() => {
                            addSolarMarket.mutate(
                              { apiKey: solarMarketApiKey.trim(), companyName: solarMarketCompanyName.trim() || undefined },
                              {
                                onSuccess: () => {
                                  setSolarMarketApiKey("");
                                  setSolarMarketCompanyName("");
                                  setSolarMarketModalOpen(false);
                                },
                              }
                            );
                          }}
                        >
                          {addSolarMarket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                          Conectar
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* ── MODAL CONFIG SOLAR MARKET ── */}
                <Dialog open={solarMarketConfigModalOpen} onOpenChange={setSolarMarketConfigModalOpen}>
                  <DialogContent className="max-w-[700px] p-0 gap-0 overflow-hidden rounded-lg">
                    {solarMarketConns.length > 0 && (() => {
                      const conn = solarMarketConns[0];
                      return (
                        <SolarMarketConfigPanel
                          conn={conn}
                          
                          deleteSolarMarket={deleteSolarMarket}
                          onClose={() => setSolarMarketConfigModalOpen(false)}
                        />
                      );
                    })()}
                  </DialogContent>
                </Dialog>

                <GoogleCalendarWizard
                  open={googleCalendarWizardOpen}
                  onOpenChange={setGoogleCalendarWizardOpen}
                />

                {/* ── MODAL ELEVENLABS ── */}
                <Dialog open={elevenLabsModalOpen} onOpenChange={setElevenLabsModalOpen}>
                  <DialogContent className="max-w-sm bg-card border-border/50">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-base">
                        <img src={elevenLabsLogo} alt="ElevenLabs" className="h-6 w-6 object-contain rounded" />
                        Ativar integração
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-foreground">Token de integração:</Label>
                        <p className="text-[11px] text-muted-foreground">Informe abaixo o token de integração ElevenLabs.</p>
                        <Input
                          value={elevenLabsTempKey}
                          onChange={e => setElevenLabsTempKey(e.target.value)}
                          type="password"
                          placeholder="Token"
                          className="bg-background/50 border-border/40 h-9 text-sm"
                          autoFocus
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Não tem seu token?{" "}
                          <a href="https://elevenlabs.io/settings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            Crie sua conta agora
                          </a>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="w-full text-xs font-semibold"
                        disabled={!elevenLabsTempKey.trim() || elevenLabsSavingKey}
                        onClick={async () => {
                          setElevenLabsSavingKey(true);
                          try {
                            const { error } = await supabase
                              .from("agents")
                              .update({ elevenlabs_api_key: elevenLabsTempKey.trim(), elevenlabs_enabled: true })
                              .eq("id", agent.id);
                            if (error) throw error;
                            setElevenLabsConfig(prev => ({ ...prev, elevenlabs_api_key: elevenLabsTempKey.trim(), elevenlabs_enabled: true }));
                            setElevenLabsTempKey("");
                            setElevenLabsModalOpen(false);
                            toast.success("ElevenLabs ativado com sucesso!");
                          } catch (err: unknown) {
                            const message = err instanceof Error ? err.message : "Erro ao salvar";
                            toast.error(message);
                          } finally {
                            setElevenLabsSavingKey(false);
                          }
                        }}
                      >
                        {elevenLabsSavingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        Ativar Integração
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* ── MODAL CONFIG ELEVENLABS ── */}
                <Dialog open={elevenLabsConfigModalOpen} onOpenChange={setElevenLabsConfigModalOpen}>
                  <DialogContent className="max-w-md bg-card border-border/50">
                    <DialogHeader>
                      <DialogTitle className="text-base font-semibold">Configurar integração</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 pt-1">
                      {/* Audio mode */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Quando responder em áudio:</Label>
                        <p className="text-[11px] text-muted-foreground">Define em quais momentos o agente vai mandar em áudio a resposta.</p>
                        <Select
                          value={elevenLabsConfig.elevenlabs_always_audio ? "always" : "audio_only"}
                          onValueChange={(v) => setElevenLabsConfig(prev => ({
                            ...prev,
                            elevenlabs_always_audio: v === "always",
                            elevenlabs_audio_on_audio: v === "audio_only",
                          }))}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="audio_only">Quando a pergunta do cliente for em áudio</SelectItem>
                            <SelectItem value="always">Responder sempre em áudio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Voice selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-foreground">Qual voz deseja usar:</Label>
                        <p className="text-[11px] text-muted-foreground">Escolha a voz que deseja usar nas respostas do agente.</p>
                        {elevenLabsLoadingVoices ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando vozes...
                          </div>
                        ) : (
                          <Select
                            value={elevenLabsConfig.elevenlabs_voice_id}
                            onValueChange={(v) => setElevenLabsConfig(prev => ({ ...prev, elevenlabs_voice_id: v }))}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Selecione uma voz" />
                            </SelectTrigger>
                            <SelectContent>
                              {elevenLabsVoices.map(v => (
                                <SelectItem key={v.voice_id} value={v.voice_id}>
                                  {v.name}{v.labels?.accent ? ` - ${v.labels.description || v.labels.accent}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {/* Test voice */}
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                          disabled={elevenLabsTesting}
                          onClick={async () => {
                            setElevenLabsTesting(true);
                            try {
                              const { data: { session: sess } } = await supabase.auth.getSession();
                              const res = await fetch(
                                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${sess?.access_token}`,
                                  },
                                  body: JSON.stringify({
                                    action: "tts",
                                    text: "Olá! Esta é uma demonstração da minha voz.",
                                    agent_id: agent.id,
                                  }),
                                }
                              );
                              if (!res.ok) throw new Error("Erro ao gerar áudio");
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const audio = new Audio(url);
                              await audio.play();
                            } catch (err: unknown) {
                              const message = err instanceof Error ? err.message : "Erro desconhecido";
                              toast.error(message);
                            } finally {
                              setElevenLabsTesting(false);
                            }
                          }}
                        >
                          {elevenLabsTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
                          Reproduzir exemplo
                        </button>
                      </div>

                      {/* Stability */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-foreground">Estabilidade</Label>
                          <span className="text-xs font-bold text-foreground">{Math.round(elevenLabsConfig.elevenlabs_stability * 100)}%</span>
                        </div>
                        <Slider
                          value={[elevenLabsConfig.elevenlabs_stability]}
                          onValueChange={([v]) => setElevenLabsConfig(prev => ({ ...prev, elevenlabs_stability: v }))}
                          min={0} max={1} step={0.01}
                          className="w-full"
                        />
                      </div>

                      {/* Similarity */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-foreground">Similaridade</Label>
                          <span className="text-xs font-bold text-foreground">{Math.round(elevenLabsConfig.elevenlabs_similarity * 100)}%</span>
                        </div>
                        <Slider
                          value={[elevenLabsConfig.elevenlabs_similarity]}
                          onValueChange={([v]) => setElevenLabsConfig(prev => ({ ...prev, elevenlabs_similarity: v }))}
                          min={0} max={1} step={0.01}
                          className="w-full"
                        />
                      </div>

                      {/* Apply button */}
                      <Button
                        className="w-full font-semibold"
                        disabled={elevenLabsSavingConfig}
                        onClick={async () => {
                          setElevenLabsSavingConfig(true);
                          try {
                            const { error } = await supabase
                              .from("agents")
                              .update({
                                elevenlabs_voice_id: elevenLabsConfig.elevenlabs_voice_id,
                                elevenlabs_stability: elevenLabsConfig.elevenlabs_stability,
                                elevenlabs_similarity: elevenLabsConfig.elevenlabs_similarity,
                                elevenlabs_always_audio: elevenLabsConfig.elevenlabs_always_audio,
                                elevenlabs_audio_on_audio: elevenLabsConfig.elevenlabs_audio_on_audio,
                                elevenlabs_enabled: true,
                              })
                              .eq("id", agent.id);
                            if (error) throw error;
                            setElevenLabsConfigModalOpen(false);
                            toast.success("Configurações ElevenLabs salvas!");
                          } catch (err: unknown) {
                            const message = err instanceof Error ? err.message : "Erro desconhecido";
                            toast.error(message);
                          } finally {
                            setElevenLabsSavingConfig(false);
                          }
                        }}
                      >
                        {elevenLabsSavingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Aplicar Configurações
                      </Button>

                      {/* Deactivate link */}
                      <button
                        type="button"
                        className="w-full text-center text-xs text-destructive hover:underline"
                        onClick={async () => {
                          try {
                            await supabase
                              .from("agents")
                              .update({ elevenlabs_api_key: null, elevenlabs_enabled: false })
                              .eq("id", agent.id);
                            setElevenLabsConfig(prev => ({ ...prev, elevenlabs_api_key: null, elevenlabs_enabled: false }));
                            setElevenLabsConfigModalOpen(false);
                            toast.success("Integração ElevenLabs desativada.");
                          } catch (err: unknown) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        Desativar integração
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* ── SERVIDORES MCP ── */}
                {activeSection === "servidores-mcp" && (
                  <div>
                    <McpIntegrations />
                  </div>
                )}

                {/* ── CANAIS ── */}
                {activeSection === "canais" && (
                  <div className="space-y-3">
                    <div>
                      <h2 className="text-base font-semibold">Canais de atendimento</h2>
                      <p className="text-sm text-muted-foreground mt-1">Escolha por onde seus clientes vão te encontrar.</p>
                    </div>

                    {/* Loading skeleton */}
                    {(connectionsLoading || telegramLoading || widgetLoading) && (
                      <div className="glass-card rounded-2xl divide-y divide-border/20 overflow-hidden">
                        {[1, 2].map(i => (
                          <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
                            <div className="h-10 w-10 rounded-xl bg-secondary/40 shrink-0" />
                            <div className="flex-1 space-y-1.5">
                              <div className="h-3 w-24 bg-secondary/40 rounded" />
                              <div className="h-2.5 w-36 bg-secondary/30 rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* All channels in a single card */}
                    {!connectionsLoading && !telegramLoading && !widgetLoading && (() => {
                      const whatsappItems = connections.filter(c => c.is_connected);
                      const widgetItems = widgetConns.filter(c => c.is_active);
                      const telegramItems = telegramConns.filter(c => c.is_connected);
                      const hasAny = whatsappItems.length > 0 || telegramItems.length > 0 || widgetItems.length > 0;

                      return (
                        <div className="glass-card rounded-2xl divide-y divide-border/20 overflow-hidden">
                          {/* WhatsApp rows */}
                          {whatsappItems.map((conn) => {
                            const isSelected = form.connection_id === conn.id;
                            return (
                <div
                                key={conn.id}
                                onClick={() => {
                                  const newId = isSelected ? null : conn.id;
                                  setForm(f => ({ ...f, connection_id: newId }));
                                  updateAgent.mutate({ id: agent.id, connection_id: newId }, {
                                    onSuccess: () => toast.success(newId ? "Canal WhatsApp vinculado!" : "Canal WhatsApp desvinculado"),
                                  });
                                }}
                                className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors ${isSelected ? "bg-primary/8" : "hover:bg-secondary/30"}`}
                              >
                                <div className="h-10 w-10 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center shrink-0 overflow-hidden">
                                  <img src={whatsappLogo} alt="WhatsApp" className="h-6 w-6 object-contain" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-semibold leading-tight truncate">
                                    {conn.phone_number?.replace(/-[a-f0-9]{12,16}$/, "") || "WhatsApp"}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">Instância WhatsApp</p>
                                </div>
                                <div className="shrink-0">
                                  {isSelected ? (
                                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                      <Check className="h-3 w-3 text-primary-foreground" />
                                    </div>
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Telegram rows */}
                          {telegramItems.map((conn) => {
                            const isSelected = form.telegram_connection_id === conn.id;
                            return (
                <div
                                key={conn.id}
                                onClick={() => {
                                  const newId = isSelected ? null : conn.id;
                                  setForm(f => ({ ...f, telegram_connection_id: newId }));
                                  updateAgent.mutate({ id: agent.id, telegram_connection_id: newId }, {
                                    onSuccess: () => toast.success(newId ? "Canal Telegram vinculado!" : "Canal Telegram desvinculado"),
                                  });
                                }}
                                className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors ${isSelected ? "bg-primary/8" : "hover:bg-secondary/30"}`}
                              >
                                <div className="h-10 w-10 rounded-xl bg-secondary/40 border border-border/20 flex items-center justify-center shrink-0 overflow-hidden">
                                  {conn.photo_url ? (
                                    <img src={conn.photo_url} alt={conn.bot_name || "Bot"} className="h-full w-full object-cover rounded-xl" />
                                  ) : (
                                    <img src={telegramLogo} alt="Telegram" className="h-6 w-6 object-contain" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-semibold leading-tight truncate">
                                    {conn.bot_name || `@${conn.bot_username}` || "Bot Telegram"}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                                    {conn.bot_username ? `@${conn.bot_username}` : "Bot do Telegram"}
                                  </p>
                                </div>
                                <div className="shrink-0">
                                  {isSelected ? (
                                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                      <Check className="h-3 w-3 text-primary-foreground" />
                                    </div>
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Empty state */}
                          {!hasAny && (
                            <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                              <Share2 className="h-8 w-8 text-muted-foreground/20" strokeWidth={1.5} />
                              <p className="text-[13px] font-medium text-muted-foreground">Nenhum canal conectado</p>
                              <p className="text-[11px] text-muted-foreground/50">Configure WhatsApp ou Telegram em Integrações primeiro.</p>
                            </div>
                          )}

                          {/* Widget Web rows */}
                          {widgetItems.map((conn) => {
                            const isLinked = conn.agent_id === agent.id;
                            return (
                              <div
                                key={conn.id}
                                onClick={async () => {
                                  const newAgentId = isLinked ? null : agent.id;
                                  const { error } = await supabase
                                    .from("widget_connections")
                                    .update({ agent_id: newAgentId })
                                    .eq("id", conn.id);
                                  if (error) {
                                    toast.error("Erro ao atualizar widget");
                                    return;
                                  }
                                  queryClient.invalidateQueries({ queryKey: ["widget_connections"] });
                                  toast.success(newAgentId ? "Widget vinculado ao agente!" : "Widget desvinculado");
                                }}
                                className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors ${isLinked ? "bg-primary/8" : "hover:bg-secondary/30"}`}
                              >
                                <div className="h-10 w-10 rounded-xl bg-secondary/40 border border-border/20 flex items-center justify-center shrink-0">
                                  <Globe className="h-5 w-5 text-muted-foreground/60" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-semibold leading-tight truncate">{conn.name}</p>
                                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">Widget Web</p>
                                </div>
                                <div className="shrink-0">
                                  {isLinked ? (
                                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                      <Check className="h-3 w-3 text-primary-foreground" />
                                    </div>
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Widget Web — show placeholder if none exist */}
                          {widgetItems.length === 0 && (
                            <div className="flex items-center gap-4 px-4 py-3.5 opacity-40 cursor-not-allowed">
                              <div className="h-10 w-10 rounded-xl bg-secondary/40 border border-border/20 flex items-center justify-center shrink-0">
                                <Share2 className="h-5 w-5 text-muted-foreground/60" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold leading-tight">Widget Web</p>
                                <p className="text-[11px] text-muted-foreground/50 mt-0.5">Crie um widget em Integrações primeiro</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── CONFIGURAÇÕES ── */}
                {activeSection === "configuracoes" && (
                  <ConfiguracoesSection agent={agent} onSave={onSave} />
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ── Test chat panel ── */}
        <AnimatePresence>
          {showTestChat && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="flex-shrink-0 border-l border-border/15 bg-card/20 backdrop-blur-xl flex flex-col overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-border/15 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">Chat de Teste</h3>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">Teste seu agente em tempo real</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowTestChat(false)} className="h-7 w-7 text-muted-foreground/40 hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <AgentChat
                agentId={agent.id}
                instructions={form.instructions}
                model={form.model}
                temperature={form.temperature}
                starters={form.conversation_starters}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
