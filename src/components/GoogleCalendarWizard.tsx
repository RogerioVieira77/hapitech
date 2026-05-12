import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Calendar, Clock, Info, Plus, ChevronRight, Trash2, GripVertical,
  Settings, LayoutList, Video, CalendarCheck, TimerOff, Shuffle,
  UserRound, Building2, MessageSquareText, Timer, Mail, FileText,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useGoogleCalendarConnections,
  initiateGoogleOAuthPopup,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_CALENDAR_FIELDS,
  type GoogleCalendar,
  type GoogleCalendarConnection,
  type BusinessHourEntry,
  type CalendarSettings,
  type CalendarFields,
} from "@/hooks/useGoogleCalendar";
import googleCalendarLogo from "@/assets/google-calendar-logo.png";

const DAYS_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

interface GoogleCalendarWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editConnection?: GoogleCalendarConnection | null;
}

export function GoogleCalendarWizard({ open, onOpenChange, editConnection }: GoogleCalendarWizardProps) {
  const { user, session } = useAuth();
  const { connections, isLoading, deleteConnection, updateConnection, saveConnection, DEFAULT_BUSINESS_HOURS } =
    useGoogleCalendarConnections();

  // Wizard state
  const [view, setView] = useState<"list" | "wizard">("list");
  const [step, setStep] = useState<1 | 2>(1);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [googleEmail, setGoogleEmail] = useState("");
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  // Step 1 state
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Step 2 state
  const [isAlwaysOpen, setIsAlwaysOpen] = useState(true);
  const [businessHours, setBusinessHours] = useState<BusinessHourEntry[]>(DEFAULT_BUSINESS_HOURS);

  // Settings & Fields state
  const [calSettings, setCalSettings] = useState<CalendarSettings>(DEFAULT_CALENDAR_SETTINGS);
  const [calFields, setCalFields] = useState<CalendarFields>(DEFAULT_CALENDAR_FIELDS);

  const [saving, setSaving] = useState(false);

  // Side nav
  const [activeNav, setActiveNav] = useState<"agendas" | "config" | "campos">("agendas");

  // Selected connection for editing in list view
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const selectedConn = connections.find((c) => c.id === selectedConnId) || null;

  // Load settings/fields when selecting a different connection OR when connections data updates after save
  const loadedConnIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedConnId && selectedConnId !== loadedConnIdRef.current) {
      const conn = connections.find((c) => c.id === selectedConnId);
      if (conn) {
        setCalSettings(conn.settings || DEFAULT_CALENDAR_SETTINGS);
        setCalFields(conn.fields || DEFAULT_CALENDAR_FIELDS);
        loadedConnIdRef.current = selectedConnId;
      }
    }
  }, [selectedConnId, connections]);

  // If editing, pre-populate
  useEffect(() => {
    if (!open) {
      loadedConnIdRef.current = null;
      return;
    }
    if (editConnection) {
      setView("wizard");
      setStep(2);
      setIsAlwaysOpen(editConnection.is_always_open);
      setBusinessHours(
        editConnection.business_hours?.length ? editConnection.business_hours : DEFAULT_BUSINESS_HOURS
      );
      setDisplayName(editConnection.display_name);
      setSelectedCalendarId(editConnection.calendar_id);
      setGoogleEmail(editConnection.google_email);
      setCalSettings(editConnection.settings || DEFAULT_CALENDAR_SETTINGS);
      setCalFields(editConnection.fields || DEFAULT_CALENDAR_FIELDS);
    } else {
      setView("list");
      setStep(1);
      // Reset only wizard-specific state, NOT calSettings/calFields
      setCalendars([]);
      setGoogleEmail("");
      setSelectedCalendarId("");
      setDisplayName("");
      setIsAlwaysOpen(true);
      setBusinessHours(DEFAULT_BUSINESS_HOURS);
      setGoogleAccessToken("");
      setGoogleRefreshToken("");
      // Auto-select first connection and load its data
      if (connections.length > 0) {
        setSelectedConnId(connections[0].id);
        const conn = connections[0];
        setCalSettings(conn.settings || DEFAULT_CALENDAR_SETTINGS);
        setCalFields(conn.fields || DEFAULT_CALENDAR_FIELDS);
      } else {
        setSelectedConnId(null);
        setCalSettings(DEFAULT_CALENDAR_SETTINGS);
        setCalFields(DEFAULT_CALENDAR_FIELDS);
      }
    }
  }, [editConnection, open, connections.length]);

  // No longer need post-OAuth redirect handling - using popup now

  // Store access/refresh tokens from popup flow
  const [googleAccessToken, setGoogleAccessToken] = useState("");
  const [googleRefreshToken, setGoogleRefreshToken] = useState("");

  function resetWizard() {
    setStep(1);
    setCalendars([]);
    setGoogleEmail("");
    setSelectedCalendarId("");
    setDisplayName("");
    setIsAlwaysOpen(true);
    setBusinessHours(DEFAULT_BUSINESS_HOURS);
    setCalSettings(DEFAULT_CALENDAR_SETTINGS);
    setCalFields(DEFAULT_CALENDAR_FIELDS);
    setGoogleAccessToken("");
    setGoogleRefreshToken("");
    
  }

  async function handleAddAccount() {
    setLoadingCalendars(true);
    try {
      const result = await initiateGoogleOAuthPopup();
      setCalendars(result.calendars);
      setGoogleEmail(result.email);
      setGoogleAccessToken(result.access_token);
      setGoogleRefreshToken(result.refresh_token);
      if (result.calendars.length > 0) {
        const primary = result.calendars.find((c) => c.primary);
        setSelectedCalendarId(primary?.id || result.calendars[0].id);
      }
      setView("wizard");
      setStep(1);
    } catch (err: any) {
      console.error("Error connecting Google:", err);
      if (err?.message !== "popup_closed_by_user") {
        toast.error("Erro ao conectar com Google: " + (err?.message || "Erro desconhecido"));
      }
    } finally {
      setLoadingCalendars(false);
    }
  }

  async function handleSave() {
    if (!user?.id) return;
    setSaving(true);
    try {
      if (editConnection) {
        await updateConnection.mutateAsync({
          id: editConnection.id,
          display_name: displayName,
          is_always_open: isAlwaysOpen,
          business_hours: isAlwaysOpen ? [] : businessHours,
          settings: calSettings,
          fields: calFields,
        } as any);
      } else {
        const selectedCal = calendars.find((c) => c.id === selectedCalendarId);
        await saveConnection.mutateAsync({
          user_id: user.id,
          google_email: googleEmail,
          calendar_id: selectedCalendarId,
          calendar_name: selectedCal?.summary || selectedCalendarId,
          display_name: displayName || selectedCal?.summary || "Minha Agenda",
          is_always_open: isAlwaysOpen,
          business_hours: isAlwaysOpen ? [] : businessHours,
          settings: calSettings,
          fields: calFields,
          provider_token: googleAccessToken || null,
          provider_refresh_token: googleRefreshToken || null,
        } as any);
      }
      onOpenChange(false);
      resetWizard();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveListSettings() {
    if (!selectedConnId) return;
    setSaving(true);
    try {
      await updateConnection.mutateAsync({
        id: selectedConnId,
        settings: calSettings,
        fields: calFields,
      } as any);
      // Reset ref so the effect will reload from fresh DB data after refetch
      loadedConnIdRef.current = null;
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(dayIndex: number) {
    setBusinessHours((prev) =>
      prev.map((h, i) => (i === dayIndex ? { ...h, enabled: !h.enabled } : h))
    );
  }

  function updateHour(dayIndex: number, field: "start" | "end", value: string) {
    setBusinessHours((prev) =>
      prev.map((h, i) => (i === dayIndex ? { ...h, [field]: value } : h))
    );
  }

  const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId);

  const navItems = [
    { key: "agendas" as const, label: "Agendas", icon: Calendar },
    { key: "config" as const, label: "Configurações", icon: Settings },
    { key: "campos" as const, label: "Campos", icon: LayoutList },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px] p-0 gap-0 overflow-hidden">
        {view === "list" ? (
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
            <div className="flex-1 p-6 flex flex-col">
              <AnimatePresence mode="wait">
                {/* ─── AGENDAS TAB ─── */}
                {activeNav === "agendas" && (
                  <motion.div key="agendas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                    <h3 className="text-base font-semibold mb-4">Agendas conectadas</h3>
                    {isLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                      </div>
                    ) : connections.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
                        <Calendar className="h-10 w-10 text-muted-foreground/20 mb-3" />
                        <p className="text-sm text-muted-foreground/50">Nenhuma agenda conectada</p>
                        <p className="text-xs text-muted-foreground/30 mt-1">Clique em "Adicionar conta" para começar</p>
                      </div>
                    ) : (
                      <div className="space-y-2 flex-1">
                        {connections.map((conn) => (
                          <div
                            key={conn.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors group cursor-pointer ${
                              selectedConnId === conn.id
                                ? "border-primary/30 bg-primary/5"
                                : "border-border/20 bg-secondary/5 hover:bg-secondary/10"
                            }`}
                            onClick={() => setSelectedConnId(conn.id === selectedConnId ? null : conn.id)}
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground/20 shrink-0" />
                            <img src={googleCalendarLogo} alt="GCal" className="h-7 w-7 object-contain shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{conn.display_name}</p>
                              <p className="text-[11px] text-muted-foreground/40 truncate">{conn.google_email}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedConnId(conn.id); setActiveNav("config"); }}
                              className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
                            >
                              Configurar <ChevronRight className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteConnection.mutate(conn.id); }}
                              className="opacity-0 group-hover:opacity-100 text-destructive/60 hover:text-destructive transition-opacity"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end mt-6">
                      <Button onClick={handleAddAccount} className="gap-2 bg-primary hover:bg-primary/90">
                        <Calendar className="h-4 w-4" />
                        Adicionar conta
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ─── CONFIGURAÇÕES TAB ─── */}
                {activeNav === "config" && (
                  <motion.div key="config" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                    <h3 className="text-base font-semibold mb-5">Configurações</h3>

                    {!selectedConnId && connections.length > 0 && (
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/20 bg-primary/5 mb-4">
                        <Info className="h-4 w-4 text-primary shrink-0" />
                        <p className="text-xs text-muted-foreground/60">Selecione uma agenda na aba "Agendas" para configurar.</p>
                      </div>
                    )}

                    <div className="space-y-4 flex-1">
                      {/* Google Meet */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Video className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Integração com Google Meet</p>
                            <p className="text-xs text-muted-foreground/50">Gerar link do meet ao fazer o agendamento</p>
                          </div>
                        </div>
                        <Switch
                          checked={calSettings.google_meet}
                          onCheckedChange={(v) => setCalSettings((s) => ({ ...s, google_meet: v }))}
                          disabled={!selectedConnId}
                        />
                      </div>

                      {/* Consulta de horários */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <CalendarCheck className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Consulta de horários</p>
                            <p className="text-xs text-muted-foreground/50">Agente pode consultar horários disponíveis</p>
                          </div>
                        </div>
                        <Switch
                          checked={calSettings.check_hours}
                          onCheckedChange={(v) => setCalSettings((s) => ({ ...s, check_hours: v }))}
                          disabled={!selectedConnId}
                        />
                      </div>

                      {/* Restrição de horários */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <TimerOff className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Restrição de horários</p>
                            <p className="text-xs text-muted-foreground/50">Permitir apenas horários cheios, ex: 09:00</p>
                          </div>
                        </div>
                        <Switch
                          checked={calSettings.restrict_hours}
                          onCheckedChange={(v) => setCalSettings((s) => ({ ...s, restrict_hours: v }))}
                          disabled={!selectedConnId}
                        />
                      </div>

                      {/* Modo de distribuição */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Shuffle className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Modo de distribuição</p>
                            <p className="text-xs text-muted-foreground/50">Como os agendamentos serão divididos</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 ml-12">
                          <button
                            onClick={() => setCalSettings((s) => ({ ...s, distribution_mode: "sequential" }))}
                            disabled={!selectedConnId}
                            className={`relative p-4 rounded-xl border text-left transition-colors ${
                              calSettings.distribution_mode === "sequential"
                                ? "border-primary/40 bg-primary/5"
                                : "border-border/20 bg-secondary/5 hover:bg-secondary/10"
                            }`}
                          >
                            {calSettings.distribution_mode === "sequential" && (
                              <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                                <span className="text-[8px] text-primary-foreground">✓</span>
                              </span>
                            )}
                            <p className="text-xs font-semibold mb-1">Distribuir sequencial</p>
                            <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                              Os agendamentos são distribuídos entre as agendas alternando de maneira sequencial.
                            </p>
                          </button>
                          <button
                            onClick={() => setCalSettings((s) => ({ ...s, distribution_mode: "smart" }))}
                            disabled={!selectedConnId}
                            className={`relative p-4 rounded-xl border text-left transition-colors ${
                              calSettings.distribution_mode === "smart"
                                ? "border-primary/40 bg-primary/5"
                                : "border-border/20 bg-secondary/5 hover:bg-secondary/10"
                            }`}
                          >
                            {calSettings.distribution_mode === "smart" && (
                              <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                                <span className="text-[8px] text-primary-foreground">✓</span>
                              </span>
                            )}
                            <p className="text-xs font-semibold mb-1">Distribuição Inteligente</p>
                            <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                              Seleciona automaticamente a agenda mais apropriada de acordo com a conversa com cliente.
                            </p>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end mt-6">
                      <Button
                        onClick={handleSaveListSettings}
                        disabled={saving || !selectedConnId}
                        className="gap-2 bg-primary hover:bg-primary/90 px-8"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Salvar
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ─── CAMPOS TAB ─── */}
                {activeNav === "campos" && (
                  <motion.div key="campos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                    <h3 className="text-base font-semibold mb-5">Campos para agendamento</h3>

                    {!selectedConnId && connections.length > 0 && (
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/20 bg-primary/5 mb-4">
                        <Info className="h-4 w-4 text-primary shrink-0" />
                        <p className="text-xs text-muted-foreground/60">Selecione uma agenda na aba "Agendas" para configurar.</p>
                      </div>
                    )}

                    <div className="space-y-4 flex-1">
                      {/* Nome */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <UserRound className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Nome</p>
                            <p className="text-xs text-muted-foreground/50">Solicitar nome do usuário</p>
                          </div>
                        </div>
                        <Switch
                          checked={calFields.request_name}
                          onCheckedChange={(v) => setCalFields((f) => ({ ...f, request_name: v }))}
                          disabled={!selectedConnId}
                        />
                      </div>

                      {/* Empresa */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Empresa</p>
                            <p className="text-xs text-muted-foreground/50">Solicitar nome da empresa</p>
                          </div>
                        </div>
                        <Switch
                          checked={calFields.request_company}
                          onCheckedChange={(v) => setCalFields((f) => ({ ...f, request_company: v }))}
                          disabled={!selectedConnId}
                        />
                      </div>

                      {/* Assunto */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <MessageSquareText className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Assunto</p>
                            <p className="text-xs text-muted-foreground/50">Solicitar assunto</p>
                          </div>
                        </div>
                        <Switch
                          checked={calFields.request_subject}
                          onCheckedChange={(v) => setCalFields((f) => ({ ...f, request_subject: v }))}
                          disabled={!selectedConnId}
                        />
                      </div>

                      {/* Duração */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Timer className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Duração do agendamento</p>
                            <p className="text-xs text-muted-foreground/50">Quanto tempo vai durar</p>
                          </div>
                        </div>
                        <Select
                          value={calFields.duration_type}
                          onValueChange={(v) => setCalFields((f) => ({ ...f, duration_type: v as any }))}
                          disabled={!selectedConnId}
                        >
                          <SelectTrigger className="w-[120px] h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="variable">Variável</SelectItem>
                            <SelectItem value="30min">30 min</SelectItem>
                            <SelectItem value="60min">60 min</SelectItem>
                            <SelectItem value="90min">90 min</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* E-mail do cliente */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Mail className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">E-mail do cliente</p>
                            <p className="text-xs text-muted-foreground/50">Solicitar e-mail para enviar convite na agenda</p>
                          </div>
                        </div>
                        <Switch
                          checked={calFields.request_email}
                          onCheckedChange={(v) => setCalFields((f) => ({ ...f, request_email: v }))}
                          disabled={!selectedConnId}
                        />
                      </div>

                      {/* Enviar resumo */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Enviar um resumo</p>
                            <p className="text-xs text-muted-foreground/50">Anexar um resumo da conversa no agendamento</p>
                          </div>
                        </div>
                        <Switch
                          checked={calFields.send_summary}
                          onCheckedChange={(v) => setCalFields((f) => ({ ...f, send_summary: v }))}
                          disabled={!selectedConnId}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end mt-6">
                      <Button
                        onClick={handleSaveListSettings}
                        disabled={saving || !selectedConnId}
                        className="gap-2 bg-primary hover:bg-primary/90 px-8"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Salvar
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          // ─── Wizard View (Step 1 & 2 for new connections) ───
          <div className="p-6 space-y-6">
            {/* Stepper */}
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-2">
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>1</span>
                <span className={`text-sm font-medium ${step === 1 ? "text-foreground" : "text-muted-foreground"}`}>Agenda</span>
              </div>
              <div className="w-12 h-px bg-border/40" />
              <div className="flex items-center gap-2">
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
                <span className={`text-sm font-medium ${step === 2 ? "text-foreground" : "text-muted-foreground"}`}>Horários de atendimento</span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
                    <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Sobre sua agenda</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5 leading-relaxed">
                        Você conectou uma conta do Google Agenda, essa conta pode ter várias sub-agendas,
                        escolha a agenda que será usada pelo seu agente para marcação de agendamentos.
                      </p>
                    </div>
                  </div>

                  {loadingCalendars ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                      <span className="ml-2 text-sm text-muted-foreground/50">Carregando agendas...</span>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Selecione a agenda:</label>
                        <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma agenda..." />
                          </SelectTrigger>
                          <SelectContent>
                            {calendars.map((cal) => (
                              <SelectItem key={cal.id} value={cal.id}>
                                {cal.summary} {cal.primary ? "(principal)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Nome da agenda</label>
                        <Input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder={selectedCalendar?.summary || "Ex: Consultório"}
                        />
                        <p className="text-[11px] text-muted-foreground/40 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          Esse nome da agenda é usado para dar contexto ao agente, ex: <i>quero agendar com fulano.</i>
                        </p>
                      </div>
                    </>
                  )}

                  <div className="flex justify-end">
                    <Button onClick={() => setStep(2)} disabled={!selectedCalendarId} className="gap-2 bg-primary hover:bg-primary/90 px-8">
                      Continuar
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
                    <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Seus horários</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5 leading-relaxed">
                        Configure os horários disponíveis para agendamentos: mantenha o atendimento sempre
                        aberto ou defina horários personalizados de atendimento para essa agenda específica.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-border/20 bg-secondary/5">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Sempre aberto</p>
                        <p className="text-xs text-muted-foreground/50">Permite agendamento em qualquer horário.</p>
                      </div>
                    </div>
                    <Switch checked={isAlwaysOpen} onCheckedChange={setIsAlwaysOpen} />
                  </div>

                  <AnimatePresence>
                    {!isAlwaysOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="space-y-3">
                          <p className="text-sm font-medium">Horários de atendimento:</p>
                          <div className="flex gap-1.5">
                            {DAYS_SHORT.map((day, i) => (
                              <button
                                key={day}
                                onClick={() => toggleDay(i)}
                                className={`h-8 px-3 rounded-full text-xs font-semibold transition-colors ${
                                  businessHours[i]?.enabled
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                }`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                          <div className="space-y-2.5">
                            {businessHours.map(
                              (h, i) =>
                                h.enabled && (
                                  <div key={h.day} className="flex items-center gap-3">
                                    <span className="text-sm text-muted-foreground w-[120px] truncate">{h.day}</span>
                                    <Input type="time" value={h.start} onChange={(e) => updateHour(i, "start", e.target.value)} className="w-[120px] h-9 text-sm" />
                                    <span className="text-muted-foreground/40">—</span>
                                    <Input type="time" value={h.end} onChange={(e) => updateHour(i, "end", e.target.value)} className="w-[120px] h-9 text-sm" />
                                    <button className="text-muted-foreground/30 hover:text-foreground transition-colors">
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                )
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex justify-between">
                    {!editConnection && (
                      <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
                    )}
                    <Button onClick={handleSave} disabled={saving} className="gap-2 bg-primary hover:bg-primary/90 px-8 ml-auto">
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Continuar
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
