import { useState, useEffect, useMemo } from "react";
import {
  X, Plus, Trash2, ChevronDown, ChevronUp, User, Mail, Phone, Building2,
  Check, DollarSign, Clock, Tag, FileText, MoreHorizontal, Search,
  Send, Users, MapPin, CreditCard,
  Settings, MessageCircle, ShoppingCart, FileIcon, AlertCircle, MessageSquare, Pencil, Bot, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lead } from "@/hooks/useLeads";
import { useLeadProducts, useLeadTasks, useLeadComments, LeadProduct, LeadTask } from "@/hooks/useLeadDetail";
import { useLeadContacts } from "@/hooks/useLeadContacts";
import { useOrgMembers } from "@/hooks/useOrganization";
import { useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { CrmStage } from "@/hooks/useCrmStages";
import { CrmCustomField, CrmCustomFieldValue } from "@/hooks/useCrmCustomFields";
import { motion, AnimatePresence } from "framer-motion";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(value);
}

const PRIORITY_MAP: Record<string, { label: string; color: string; dot: string }> = {
  baixa: { label: "Baixa", color: "bg-emerald-500", dot: "bg-emerald-500" },
  media: { label: "Média", color: "bg-amber-500", dot: "bg-amber-500" },
  alta: { label: "Alta", color: "bg-red-500", dot: "bg-red-500" },
};

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-pink-400 to-rose-600",
  "from-fuchsia-400 to-purple-600",
];

const TIMELINE_COLORS = {
  funnel: "bg-teal-500",
  comment: "bg-blue-500",
  field: "bg-amber-500",
  created: "bg-muted-foreground/30",
  task: "bg-violet-500",
  proposal: "bg-emerald-500",
};

interface LeadDetailPanelProps {
  lead: Lead;
  stages: CrmStage[];
  customFields: CrmCustomField[];
  fieldValues: CrmCustomFieldValue[];
  onClose: () => void;
  onUpdate: (updates: Partial<Lead> & { id: string }) => void;
  onSetFieldValue: (params: { leadId: string; fieldId: string; value: string }) => void;
  fullPage?: boolean;
}

/* Collapsible Section */
function Section({ title, children, defaultOpen = true, action }: { title: string; children: React.ReactNode; defaultOpen?: boolean; action?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/15 bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-muted/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-foreground">{title}</span>
          <button className="text-muted-foreground/20 hover:text-muted-foreground/60 p-0.5"><MoreHorizontal className="h-3.5 w-3.5" /></button>
        </div>
        <div className="flex items-center gap-2">
          {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
          <ChevronUp className={`h-4 w-4 text-muted-foreground/30 transition-transform ${open ? "" : "rotate-180"}`} />
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LeadDetailPanel({
  lead, stages, customFields, fieldValues, onClose, onUpdate, onSetFieldValue, fullPage = false,
}: LeadDetailPanelProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("gerenciamento");
  const [historyFilter, setHistoryFilter] = useState("todas");
  const [showExistingSearch, setShowExistingSearch] = useState(false);
  const [existingSearchTerm, setExistingSearchTerm] = useState("");

  // Lead form state
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone || "");
  const [email, setEmail] = useState(lead.email || "");
  const [company, setCompany] = useState(lead.company || "");
  const [notes, setNotes] = useState(lead.notes || "");
  const [stage, setStage] = useState(lead.stage);
  const [priority, setPriority] = useState((lead as any).priority || "media");
  const [assignedTo, setAssignedTo] = useState((lead as any).assigned_to || "");
  const [value, setValue] = useState(lead.value || 0);
  const [cpfCnpj, setCpfCnpj] = useState((lead as any).cpf_cnpj || "");
  const [location, setLocation] = useState((lead as any).location || "");

  // Custom field values
  const leadFieldValues = fieldValues.filter(v => v.lead_id === lead.id);
  const [cfValues, setCfValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    leadFieldValues.forEach(v => { map[v.field_id] = v.value || ""; });
    return map;
  });

  // Products
  const { products, saveProducts } = useLeadProducts(lead.id);
  const [localProducts, setLocalProducts] = useState<Partial<LeadProduct>[]>([]);
  useEffect(() => { setLocalProducts(products.length > 0 ? products : []); }, [products]);

  // Tasks
  const { tasks, saveTasks } = useLeadTasks(lead.id);
  const [localTasks, setLocalTasks] = useState<Partial<LeadTask>[]>([]);
  useEffect(() => { setLocalTasks(tasks.length > 0 ? tasks : []); }, [tasks]);

  // Comments
  const { comments, addComment } = useLeadComments(lead.id);
  const [newComment, setNewComment] = useState("");

  // Lead Contacts
  const { contacts: leadContacts, addContact, updateContact, deleteContact } = useLeadContacts(lead.id);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactRole, setNewContactRole] = useState("");

  // Fetch profile pics for lead contacts by phone
  const contactPhones = [
    ...(lead.phone ? [lead.phone.replace(/\D/g, "")] : []),
    ...leadContacts.map(c => c.phone?.replace(/\D/g, "")).filter(Boolean),
  ] as string[];
  const { data: contactPicMap = {} } = useQuery({
    queryKey: ["lead-contact-pics", lead.id, contactPhones.join(",")],
    queryFn: async () => {
      if (contactPhones.length === 0) return {};
      const { data } = await supabase
        .from("conversations")
        .select("contact_phone, profile_picture_url")
        .not("profile_picture_url", "is", null);
      if (!data) return {};
      const map: Record<string, string> = {};
      data.forEach((row: any) => {
        if (row.contact_phone && row.profile_picture_url) {
          const clean = row.contact_phone.replace(/\D/g, "");
          map[clean] = row.profile_picture_url;
          if (clean.length > 8) map[clean.slice(-8)] = row.profile_picture_url;
        }
      });
      return map;
    },
    enabled: contactPhones.length > 0,
  });
  const getContactPic = (phone: string | null) => {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, "");
    return contactPicMap[clean] || contactPicMap[clean.slice(-8)] || null;
  };

  // Org members
  const { data: orgData } = useQuery({
    queryKey: ["my-org-id-detail"],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.organization_id || null;
    },
    enabled: !!user,
  });
  const { data: orgMembers = [] } = useOrgMembers(orgData || undefined);

  // Search existing conversations for adding as contacts
  const { data: existingContacts = [] } = useQuery({
    queryKey: ["existing-contacts-search", existingSearchTerm],
    queryFn: async () => {
      const term = existingSearchTerm.trim();
      if (!term || term.length < 2) return [];
      const { data } = await supabase
        .from("conversations")
        .select("id, contact_name, contact_phone, contact_email, contact_company, contact_job_title, profile_picture_url")
        .or(`contact_name.ilike.%${term}%,contact_phone.ilike.%${term}%,contact_email.ilike.%${term}%`)
        .limit(10);
      return (data || []) as { id: string; contact_name: string | null; contact_phone: string | null; contact_email: string | null; contact_company: string | null; contact_job_title: string | null; profile_picture_url: string | null }[];
    },
    enabled: existingSearchTerm.trim().length >= 2,
  });

  // Chat: find conversation by lead phone
  const cleanPhone = phone?.replace(/\D/g, "") || "";
  const { data: chatConversation } = useQuery({
    queryKey: ["lead-chat-conversation", cleanPhone],
    queryFn: async () => {
      if (!cleanPhone) return null;
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .or(`contact_phone.ilike.%${cleanPhone}%,remote_jid.ilike.%${cleanPhone}%`)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!cleanPhone && cleanPhone.length >= 8,
  });

  const { data: chatMessages = [], isLoading: chatLoading } = useQuery({
    queryKey: ["lead-chat-messages", chatConversation?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", chatConversation!.id)
        .order("timestamp", { ascending: true });
      return (data || []) as { id: string; content: string; sender: string; timestamp: string; media_type: string | null; media_url: string | null }[];
    },
    enabled: !!chatConversation?.id,
  });

  const chatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeTab === "chat") chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeTab]);

  // All pipelines & stages
  const { data: allPipelines = [] } = useQuery({
    queryKey: ["all-pipelines-detail", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_pipelines")
        .select("id, name, position")
        .order("position", { ascending: true });
      return (data || []) as { id: string; name: string; position: number }[];
    },
    enabled: !!user,
  });

  const { data: allStagesGlobal = [] } = useQuery({
    queryKey: ["all-stages-detail", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_stages")
        .select("id, name, slug, pipeline_id, position")
        .order("position", { ascending: true });
      return (data || []) as { id: string; name: string; slug: string; pipeline_id: string | null; position: number }[];
    },
    enabled: !!user,
  });

  // Build pipeline info
  const pipelinesForLead = useMemo(() => {
    const leadStageObj = allStagesGlobal.find(s => s.slug === lead.stage);
    const leadPipelineId = leadStageObj?.pipeline_id;
    return allPipelines.map(p => {
      const pStages = allStagesGlobal.filter(s => s.pipeline_id === p.id).sort((a, b) => a.position - b.position);
      const stageMatch = pStages.find(s => s.slug === stage);
      const stageIdx = stageMatch ? pStages.indexOf(stageMatch) : -1;
      return { ...p, stages: pStages, isActive: p.id === leadPipelineId, currentStageIdx: stageIdx, currentStage: stageMatch };
    });
  }, [allPipelines, allStagesGlobal, stage, lead.stage]);

  const activePipeline = pipelinesForLead.find(p => p.isActive);
  const totalProducts = localProducts.reduce((a, p) => a + (p.quantity || 1) * (p.price || 0), 0);

  const currentStage = stages.find(s => s.slug === stage);
  const pri = PRIORITY_MAP[priority] || PRIORITY_MAP.media;

  const handleSave = () => {
    onUpdate({
      id: lead.id, name, phone: phone || null, email: email || null, company: company || null,
      notes: notes || null, stage, value: totalProducts > 0 ? totalProducts : value,
    });
    supabase.from("leads").update({ priority, assigned_to: assignedTo || null, cpf_cnpj: cpfCnpj || null, location: location || null } as any).eq("id", lead.id).then();
    Object.entries(cfValues).forEach(([fieldId, val]) => {
      onSetFieldValue({ leadId: lead.id, fieldId, value: val });
    });
  };

  const handleSaveProducts = () => { saveProducts(localProducts.filter(p => p.name?.trim())); };
  const handleSaveTasks = () => { saveTasks(localTasks.filter(t => t.title?.trim())); };
  const handleAddComment = () => { if (!newComment.trim()) return; addComment(newComment.trim()); setNewComment(""); };

  const handleWin = () => {
    const wonStage = stages.find(s => s.slug === "ganho");
    if (wonStage) { setStage("ganho"); onUpdate({ id: lead.id, stage: "ganho" }); }
  };
  const handleLose = () => {
    const lostStage = stages.find(s => s.slug === "perdido");
    if (lostStage) { setStage("perdido"); onUpdate({ id: lead.id, stage: "perdido" }); }
  };

  const tabs = [
    { key: "gerenciamento", label: "Gerenciamento", icon: <Settings className="h-4 w-4" /> },
    { key: "produtos", label: `Produtos (${localProducts.length})`, icon: <ShoppingCart className="h-4 w-4" /> },
    { key: "documentos", label: "Documentos (0)", icon: <FileIcon className="h-4 w-4" /> },
  ];

  const historyTabs = [
    { key: "todas", label: "Todas" },
    { key: "atividades", label: "Atividades" },
    { key: "notas", label: "Notas" },
    { key: "funil", label: `Funil (${pipelinesForLead.filter(p => p.isActive).length})` },
    { key: "projeto", label: "Projeto (1)" },
  ];

  const formatRelativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 30) return `há ${Math.floor(days / 30)} meses`;
    if (days > 0) return `há ${days} dias`;
    if (hours > 0) return `há ${hours}h`;
    return `há ${minutes}min`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR") + " " + new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const innerContent = (
    <>
      {/* ===== HEADER ===== */}
      <div className="shrink-0 px-6 pt-5 pb-3 border-b border-border/10">
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground/50 mb-2">
              <span className="hover:text-primary cursor-pointer transition-colors" onClick={onClose}>Projetos</span>
              <span>{">"}</span>
              <span className="flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                {name || company || `Projeto #${lead.id.slice(0, 4).toUpperCase()}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="text-[22px] font-bold text-foreground bg-transparent outline-none"
                placeholder="Nome da empresa"
              />
              <button className="text-muted-foreground/30 hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
              {lead.source && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 font-semibold">{lead.source}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-muted-foreground/30 hover:text-foreground p-1"><X className="h-5 w-5" /></button>
          </div>
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="shrink-0 border-b border-border/10 px-6">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-[13px] font-medium border-b-2 transition-all ${
                activeTab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground/60 hover:text-muted-foreground/60"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== PIPELINE PROGRESS ===== */}
      {activeTab === "gerenciamento" && activePipeline && (
        <div className="shrink-0 border-b border-border/10 px-6 py-5">
          <div className="flex items-start justify-between gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[14px] font-semibold text-foreground border-b-2 border-primary pb-0.5">{activePipeline.name}</span>
                <button className="text-muted-foreground/20 hover:text-foreground p-0.5"><Plus className="h-3.5 w-3.5" /></button>
                <button className="text-muted-foreground/20 hover:text-destructive p-0.5"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <p className="text-[13px] text-muted-foreground/50 mb-4">{currentStage?.name || stage}</p>
              {/* Progress dots */}
              <div className="flex items-center gap-0">
                {activePipeline.stages.map((s, i) => {
                  const currentIdx = activePipeline.currentStageIdx >= 0 ? activePipeline.currentStageIdx : -1;
                  const isActive = i <= currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div key={s.id} className="flex items-center flex-1">
                      <button
                        onClick={() => setStage(s.slug)}
                        title={s.name}
                        className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 transition-all ${
                          isCurrent
                            ? "border-primary bg-primary scale-[1.3]"
                            : isActive
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/20 bg-background"
                        }`}
                      />
                      {i < activePipeline.stages.length - 1 && (
                        <div className={`h-[3px] flex-1 transition-all ${isActive && i < currentIdx ? "bg-primary" : "bg-muted-foreground/10"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Ganhar/Perder + Responsável */}
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                <Button onClick={handleWin} size="sm" className="h-9 px-5 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold">
                  Ganhar
                </Button>
                <Button onClick={handleLose} size="sm" variant="destructive" className="h-9 px-5 text-[12px] rounded-lg font-semibold">
                  Perder
                </Button>
              </div>
              <div className="text-right">
                <span className="text-[12px] text-muted-foreground/60 block mb-1">Responsável no funil</span>
                <Select value={assignedTo || ""} onValueChange={setAssignedTo}>
                  <SelectTrigger className="h-9 text-[12px] bg-card border-border/15 shadow-none px-3 text-foreground/80 font-medium rounded-lg min-w-[180px]">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" className="text-xs">Não definido</SelectItem>
                    {orgMembers.map(m => (
                      <SelectItem key={m.user_id} value={m.user_id} className="text-xs">{m.display_name || m.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONTENT ===== */}
      {activeTab === "chat" ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          {!cleanPhone || cleanPhone.length < 8 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="h-14 w-14 rounded-2xl bg-muted/10 flex items-center justify-center">
                <Phone className="h-6 w-6 text-muted-foreground/20" strokeWidth={1.5} />
              </div>
              <p className="text-[13px] text-muted-foreground/60 font-medium">Adicione um número de telefone ao lead para ver o histórico de conversas</p>
            </div>
          ) : !chatConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="h-14 w-14 rounded-2xl bg-muted/10 flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-muted-foreground/20" strokeWidth={1.5} />
              </div>
              <p className="text-[13px] text-muted-foreground/60 font-medium">Nenhuma conversa encontrada para o número {phone}</p>
            </div>
          ) : chatLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
              {chatMessages.map((msg) => {
                const isUser = msg.sender === "user";
                const time = new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const date = new Date(msg.timestamp).toLocaleDateString("pt-BR");
                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-start" : "justify-end"} mb-2`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                      isUser
                        ? "bg-muted/10 text-foreground border border-border/10"
                        : "bg-primary text-primary-foreground"
                    }`}>
                      {msg.media_url && msg.media_type?.startsWith("image") && (
                        <img src={msg.media_url} alt="mídia" className="rounded-xl max-w-full mb-2" />
                      )}
                      {msg.media_url && msg.media_type?.startsWith("audio") && (
                        <audio controls src={msg.media_url} className="max-w-full mb-2" />
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isUser ? "text-muted-foreground/30" : "text-primary-foreground/60"}`}>{time} · {date}</p>
                    </div>
                  </div>
                );
              })}
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/15" />
                  <p className="text-[13px] text-muted-foreground/30">Nenhuma mensagem nesta conversa</p>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          )}
        </div>
      ) : (
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* LEFT COLUMN */}
        <div className="w-full md:w-[420px] shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r border-border/8 p-5 space-y-4">
          {activeTab === "gerenciamento" && (
            <>
              {/* Dados do cliente */}
              <Section title="Dados do cliente" defaultOpen>
                <div className="space-y-3.5">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Adicionar Nome"
                      className="text-[13px] text-primary bg-transparent outline-none hover:underline cursor-pointer placeholder:text-primary/60 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
                    <input
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      placeholder="Adicionar Empresa"
                      className="text-[13px] text-primary bg-transparent outline-none hover:underline cursor-pointer placeholder:text-primary/60 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-4 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
                    <input
                      value={cpfCnpj}
                      onChange={e => setCpfCnpj(e.target.value)}
                      placeholder="Adicionar CNPJ/CPF"
                      className="text-[13px] text-primary bg-transparent outline-none hover:underline cursor-pointer placeholder:text-primary/60 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
                    <input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Adicionar Telefone"
                      className="text-[13px] text-primary bg-transparent outline-none hover:underline cursor-pointer placeholder:text-primary/60 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Adicionar Email"
                      className="text-[13px] text-primary bg-transparent outline-none hover:underline cursor-pointer placeholder:text-primary/60 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
                    <input
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="Adicionar Localização"
                      className="text-[13px] text-primary bg-transparent outline-none hover:underline cursor-pointer placeholder:text-primary/60 flex-1"
                    />
                  </div>
                </div>
              </Section>

              {/* Contatos do projeto */}
              <Section
                title={`Contatos (${leadContacts.length + (lead.phone ? 1 : 0)})`}
                defaultOpen
                action={
                  <div className="flex items-center gap-1.5">
                    <Button
                      onClick={() => { setShowExistingSearch(true); setShowAddContact(false); setExistingSearchTerm(""); }}
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-[11px] border-border/15 rounded-lg font-semibold"
                    >
                      <Search className="h-3 w-3 mr-1" /> Existente
                    </Button>
                    <Button
                      onClick={() => { setShowAddContact(true); setShowExistingSearch(false); }}
                      size="sm"
                      className="h-7 px-3 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Novo
                    </Button>
                  </div>
                }
              >
                <div className="space-y-2">
                  {/* Search existing contacts */}
                  {showExistingSearch && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3 space-y-2.5">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
                        <input
                          value={existingSearchTerm}
                          onChange={e => setExistingSearchTerm(e.target.value)}
                          placeholder="Buscar por nome, telefone ou email..."
                          autoFocus
                          className="w-full text-[12px] bg-background border border-border/15 rounded-lg pl-8 pr-2.5 py-2 outline-none focus:border-primary/30 text-foreground"
                        />
                      </div>
                      {existingSearchTerm.trim().length >= 2 && (
                        <div className="max-h-48 overflow-auto space-y-1">
                          {existingContacts.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground/30 text-center py-2">Nenhum contato encontrado</p>
                          ) : (
                            existingContacts.map((c, idx) => (
                              <button
                                key={c.id}
                                onClick={() => {
                                  addContact.mutate({
                                    name: c.contact_name || "Sem nome",
                                    phone: c.contact_phone || undefined,
                                    email: c.contact_email || undefined,
                                    role: c.contact_job_title || "",
                                  });
                                  setShowExistingSearch(false);
                                  setExistingSearchTerm("");
                                }}
                                className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-background transition-colors text-left"
                              >
                                <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]} flex items-center justify-center shrink-0`}>
                                  <span className="text-[10px] font-bold text-white">{(c.contact_name || "C")[0].toUpperCase()}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-semibold text-foreground truncate">{c.contact_name || "Sem nome"}</p>
                                  <p className="text-[10px] text-muted-foreground/50 truncate">
                                    {[c.contact_phone, c.contact_email].filter(Boolean).join(" · ") || "Sem dados"}
                                  </p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setShowExistingSearch(false); setExistingSearchTerm(""); }}
                          className="h-7 px-3 text-[11px] text-muted-foreground"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Lead's own phone as primary contact */}
                  {lead.phone && (() => {
                    const leadPic = getContactPic(lead.phone);
                    return (
                      <div className="flex items-start gap-3 rounded-xl bg-muted/5 border border-border/10 px-3.5 py-3">
                        {leadPic ? (
                          <img src={leadPic} alt={lead.name} className="h-9 w-9 rounded-full object-cover border border-border/15 shrink-0 mt-0.5" />
                        ) : (
                          <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[0]} flex items-center justify-center shrink-0 mt-0.5`}>
                            <span className="text-[11px] font-bold text-white">{(lead.name || "L")[0].toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-foreground truncate">{lead.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-accent/10 text-accent font-semibold uppercase tracking-wide">Principal</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {lead.phone}
                            </span>
                            {lead.email && (
                              <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {lead.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                   {leadContacts.map((c, idx) => {
                    const pic = getContactPic(c.phone);
                    return (
                    <div key={c.id} className="flex items-start gap-3 group rounded-xl bg-muted/5 border border-border/10 px-3.5 py-3">
                      {pic ? (
                        <img src={pic} alt={c.name} className="h-9 w-9 rounded-full object-cover border border-border/15 shrink-0 mt-0.5" />
                      ) : (
                      <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]} flex items-center justify-center shrink-0 mt-0.5`}>
                        <span className="text-[11px] font-bold text-white">{(c.name || "C")[0].toUpperCase()}</span>
                      </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-foreground truncate">{c.name || "Sem nome"}</span>
                          {c.role && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold uppercase tracking-wide">{c.role}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          {c.phone && (
                            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {c.phone}
                            </span>
                          )}
                          {c.email && (
                            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {c.email}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteContact.mutate(c.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground/20 hover:text-destructive transition-all p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                   );
                  })}

                  {leadContacts.length === 0 && !showAddContact && !showExistingSearch && (
                    <p className="text-[12px] text-muted-foreground/30 text-center py-3">Nenhum contato adicionado</p>
                  )}

                  {showAddContact && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={newContactName}
                          onChange={e => setNewContactName(e.target.value)}
                          placeholder="Nome *"
                          className="text-[12px] bg-background border border-border/15 rounded-lg px-2.5 py-2 outline-none focus:border-primary/30 text-foreground"
                        />
                        <input
                          value={newContactRole}
                          onChange={e => setNewContactRole(e.target.value)}
                          placeholder="Cargo (ex: Gerente)"
                          className="text-[12px] bg-background border border-border/15 rounded-lg px-2.5 py-2 outline-none focus:border-primary/30 text-foreground"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={newContactPhone}
                          onChange={e => setNewContactPhone(e.target.value)}
                          placeholder="Telefone"
                          className="text-[12px] bg-background border border-border/15 rounded-lg px-2.5 py-2 outline-none focus:border-primary/30 text-foreground"
                        />
                        <input
                          value={newContactEmail}
                          onChange={e => setNewContactEmail(e.target.value)}
                          placeholder="Email"
                          className="text-[12px] bg-background border border-border/15 rounded-lg px-2.5 py-2 outline-none focus:border-primary/30 text-foreground"
                        />
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setShowAddContact(false); setNewContactName(""); setNewContactPhone(""); setNewContactEmail(""); setNewContactRole(""); }}
                          className="h-7 px-3 text-[11px] text-muted-foreground"
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={!newContactName.trim()}
                          onClick={() => {
                            addContact.mutate({
                              name: newContactName.trim(),
                              phone: newContactPhone.trim() || undefined,
                              email: newContactEmail.trim() || undefined,
                              role: newContactRole.trim(),
                            });
                            setShowAddContact(false);
                            setNewContactName("");
                            setNewContactPhone("");
                            setNewContactEmail("");
                            setNewContactRole("");
                          }}
                          className="h-7 px-3 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold"
                        >
                          <Check className="h-3 w-3 mr-1" /> Salvar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* Campos importantes */}
              <Section title="Campos importantes" defaultOpen>
                <div className="space-y-3">
                  <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                    <span className="text-[12px] text-muted-foreground/50 font-medium">Status</span>
                    <Select value={stage} onValueChange={setStage}>
                      <SelectTrigger className="h-8 text-[12px] bg-muted/5 border-border/10 shadow-none px-2.5 text-foreground/80 font-medium rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map(s => <SelectItem key={s.id} value={s.slug} className="text-xs">{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                    <span className="text-[12px] text-muted-foreground/50 font-medium">Prioridade</span>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger className="h-8 text-[12px] bg-muted/5 border-border/10 shadow-none px-2.5 text-foreground/80 font-medium rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa" className="text-xs"><div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Baixa</div></SelectItem>
                        <SelectItem value="media" className="text-xs"><div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Média</div></SelectItem>
                        <SelectItem value="alta" className="text-xs"><div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-red-500" /> Alta</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                    <span className="text-[12px] text-muted-foreground/50 font-medium">Valor</span>
                    <input
                      type="number"
                      value={value}
                      onChange={e => setValue(Number(e.target.value) || 0)}
                      className="h-8 text-[12px] bg-muted/5 border border-border/10 rounded-lg px-2.5 text-foreground/80 outline-none focus:border-primary/30 transition-colors"
                    />
                  </div>
                  {customFields.length === 0 && (
                    <p className="text-[12px] text-muted-foreground/30 text-center py-2">Nenhum campo importante encontrado para esta etapa</p>
                  )}
                </div>
              </Section>

              {/* Outros campos */}
              {customFields.length > 0 && (
                <Section title="Outros campos" defaultOpen>
                  <div className="space-y-3">
                    {customFields.map(cf => (
                      <div key={cf.id} className="grid grid-cols-[100px_1fr_auto] items-center gap-2">
                        <span className="text-[12px] text-muted-foreground/50 font-medium flex items-center gap-1.5">
                          <Tag className="h-3 w-3" />{cf.name}
                        </span>
                        {cf.field_type === "select" && cf.options?.length > 0 ? (
                          <Select value={cfValues[cf.id] || ""} onValueChange={v => setCfValues(prev => ({ ...prev, [cf.id]: v }))}>
                            <SelectTrigger className="h-8 text-[12px] bg-muted/5 border-border/10 shadow-none px-2.5 text-foreground/80 rounded-lg">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>{cf.options.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <input
                            value={cfValues[cf.id] || ""}
                            onChange={e => setCfValues(prev => ({ ...prev, [cf.id]: e.target.value }))}
                            placeholder="—"
                            className="h-8 text-[12px] bg-muted/5 border border-border/10 rounded-lg px-2.5 text-foreground/80 outline-none focus:border-primary/30 transition-colors"
                          />
                        )}
                        <button className="text-muted-foreground/15 hover:text-muted-foreground/60 transition-colors p-1">
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Observação */}
              <Section title="Observação" defaultOpen={!!notes}>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Adicionar observação..."
                  rows={3}
                  className="bg-muted/5 border-border/10 resize-none text-[13px] text-foreground/80 placeholder:text-muted-foreground/20 rounded-xl focus-visible:ring-0 focus-visible:border-primary/20"
                />
              </Section>

              {/* Seguidores */}
              <Section title="Seguidores" defaultOpen={false}>
                <div className="space-y-2">
                  {orgMembers.map((m, i) => (
                    <div key={m.user_id} className="flex items-center gap-3">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.display_name || "Usuário"} className="h-9 w-9 rounded-full object-cover border-2 border-background shadow-sm" />
                      ) : (
                        <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center border-2 border-background shadow-sm`}>
                          <span className="text-[11px] font-bold text-white">{(m.display_name || "U")[0].toUpperCase()}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{m.display_name || "Usuário"}</p>
                        <p className="text-[11px] text-muted-foreground/50 capitalize">{m.role || "membro"}</p>
                      </div>
                    </div>
                  ))}
                  {orgMembers.length === 0 && (
                    <p className="text-[12px] text-muted-foreground/30">Nenhum seguidor</p>
                  )}
                </div>
              </Section>

              {/* Save */}
              <Button onClick={handleSave} className="w-full h-10 text-[13px] bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold">
                Salvar alterações
              </Button>
            </>
          )}

          {activeTab === "produtos" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-bold text-foreground">Produtos</h3>
                {totalProducts > 0 && (
                  <span className="text-[13px] font-bold text-emerald-500">{formatCurrency(totalProducts)}</span>
                )}
              </div>
              <div className="space-y-2">
                {localProducts.map((p, i) => (
                  <div key={i} className="group rounded-xl bg-card border border-border/10 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input value={p.name || ""} onChange={e => { const a = [...localProducts]; a[i] = { ...a[i], name: e.target.value }; setLocalProducts(a); }} placeholder="Nome do produto" className="flex-1 min-w-[100px] text-[13px] text-foreground bg-transparent outline-none font-medium" />
                      <div className="flex items-center gap-1.5">
                        <input type="number" value={p.quantity || 1} onChange={e => { const a = [...localProducts]; a[i] = { ...a[i], quantity: Number(e.target.value) }; setLocalProducts(a); }} className="w-10 text-[12px] text-center text-foreground/60 bg-muted/5 rounded-lg border border-border/10 py-1 outline-none" />
                        <span className="text-muted-foreground/25 text-[11px]">×</span>
                        <input type="number" value={p.price || 0} onChange={e => { const a = [...localProducts]; a[i] = { ...a[i], price: Number(e.target.value) }; setLocalProducts(a); }} className="w-16 text-[12px] text-foreground/60 bg-muted/5 rounded-lg border border-border/10 py-1 px-2 outline-none" />
                      </div>
                      <span className="text-[12px] text-muted-foreground/50 font-semibold tabular-nums ml-auto">{formatCurrency((p.quantity || 1) * (p.price || 0))}</span>
                      <button onClick={() => setLocalProducts(prev => prev.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100 text-muted-foreground/20 hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setLocalProducts(prev => [...prev, { name: "", quantity: 1, price: 0 }])} className="text-[12px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 font-medium"><Plus className="h-3.5 w-3.5" /> Adicionar produto</button>
                {localProducts.length > 0 && <Button onClick={handleSaveProducts} size="sm" className="ml-auto h-8 px-4 text-[11px] rounded-lg"><Check className="h-3 w-3 mr-1" /> Salvar</Button>}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "gerenciamento" && (
            <>
              {/* Atividades a fazer */}
              <Section
                title="Atividades a fazer"
                defaultOpen
                action={
                  <Button
                    onClick={() => setLocalTasks(prev => [...prev, { title: "", task_type: "task", due_date: null, assigned_to: null, status: "pending" }])}
                    size="sm"
                    className="h-8 px-4 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold"
                  >
                    + Nova atividade
                  </Button>
                }
              >
                {localTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div className="h-14 w-14 rounded-full border-2 border-amber-400/30 flex items-center justify-center mb-3">
                      <AlertCircle className="h-7 w-7 text-amber-400/50" />
                    </div>
                    <p className="text-[13px] text-muted-foreground/60 font-medium">Nenhuma atividade encontrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {localTasks.map((t, i) => (
                      <div key={i} className="flex items-start gap-3 group py-2">
                        <button
                          onClick={() => { const a = [...localTasks]; a[i] = { ...a[i], status: a[i].status === "done" ? "pending" : "done" }; setLocalTasks(a); }}
                          className={`mt-0.5 h-5 w-5 rounded-md border-2 shrink-0 transition-all flex items-center justify-center ${t.status === "done" ? "bg-primary border-primary" : "border-muted-foreground/20 hover:border-primary/50"}`}
                        >
                          {t.status === "done" && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <input value={t.title || ""} onChange={e => { const a = [...localTasks]; a[i] = { ...a[i], title: e.target.value }; setLocalTasks(a); }} placeholder="Título da atividade" className={`w-full text-[13px] bg-transparent outline-none ${t.status === "done" ? "line-through text-muted-foreground/30" : "text-foreground"}`} />
                          <div className="flex items-center gap-2 mt-1">
                            <select
                              value={(t as any).task_type || "task"}
                              onChange={e => { const a = [...localTasks]; a[i] = { ...a[i], task_type: e.target.value } as any; setLocalTasks(a); }}
                              className="text-[10px] text-muted-foreground/60 bg-muted/10 border border-border/10 rounded-md px-1.5 py-0.5 outline-none cursor-pointer"
                            >
                              <option value="task">Tarefa</option>
                              <option value="follow_up">Follow Up</option>
                              <option value="meeting">Reunião</option>
                              <option value="first_contact">Primeiro Contato</option>
                              <option value="call">Ligação</option>
                              <option value="email">E-mail</option>
                            </select>
                            <input type="date" value={(t.due_date || "").slice(0, 10)} onChange={e => { const a = [...localTasks]; const time = (a[i].due_date || "").slice(10); a[i] = { ...a[i], due_date: e.target.value ? e.target.value + time : null }; setLocalTasks(a); }} className="text-[10px] text-muted-foreground/60 bg-transparent outline-none" />
                            <input type="time" value={(t.due_date || "").length > 10 ? (t.due_date || "").slice(11, 16) : ""} onChange={e => { const a = [...localTasks]; const dateP = (a[i].due_date || "").slice(0, 10); if (dateP) { a[i] = { ...a[i], due_date: dateP + "T" + e.target.value }; setLocalTasks(a); } }} className="text-[10px] text-muted-foreground/60 bg-transparent outline-none w-[60px]" />
                          </div>
                        </div>
                        <button onClick={() => setLocalTasks(prev => prev.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100 text-muted-foreground/20 hover:text-destructive transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    <Button onClick={handleSaveTasks} size="sm" className="h-7 px-3 text-[11px] rounded-lg"><Check className="h-3 w-3 mr-1" /> Salvar tarefas</Button>
                  </div>
                )}
              </Section>

              {/* Histórico */}
              <Section
                title="Histórico"
                defaultOpen
                action={
                  <Button
                    onClick={() => {}}
                    size="sm"
                    className="h-8 px-4 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold"
                  >
                    + Nova nota
                  </Button>
                }
              >
                {/* Filter tabs */}
                <div className="flex items-center gap-1 mb-5 flex-wrap">
                  {historyTabs.map(ht => (
                    <button
                      key={ht.key}
                      onClick={() => setHistoryFilter(ht.key)}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                        historyFilter === ht.key
                          ? "bg-foreground text-background"
                          : "text-muted-foreground/60 hover:text-muted-foreground/60 hover:bg-muted/10"
                      }`}
                    >
                      {ht.label}
                    </button>
                  ))}
                </div>

                {/* Comment input */}
                <div className="flex items-start gap-3 mb-5">
                  <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[0]} flex items-center justify-center shrink-0 mt-0.5`}>
                    <span className="text-[10px] font-bold text-white">{user?.email?.[0]?.toUpperCase() || "U"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Textarea
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="Escrever nota..."
                      rows={2}
                      className="bg-card border-border/10 resize-none text-[13px] rounded-xl focus-visible:ring-0 focus-visible:border-primary/20 mb-2"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim()} className="h-8 px-4 text-[11px] rounded-lg font-medium bg-muted/20 text-muted-foreground hover:bg-muted/40">
                        <Send className="h-3 w-3 mr-1.5" /> Enviar
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[13px] top-3 bottom-3 w-[2px] bg-border/15" />

                  <div className="space-y-0">
                    {comments.map((c) => {
                      const commentColorIdx = (c.display_name || "U").charCodeAt(0) % AVATAR_GRADIENTS.length;
                      return (
                        <div key={c.id} className="flex gap-4 py-3.5 relative">
                          <div className="relative z-10">
                            <div className="h-7 w-7 rounded-full bg-blue-500 flex items-center justify-center ring-[3px] ring-background">
                              <MessageSquare className="h-3 w-3 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-[13px] font-semibold text-foreground/80">{c.display_name || "Usuário"}</span>
                              <div className="flex items-center gap-2">
                                <div className={`h-5 w-5 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[commentColorIdx]} flex items-center justify-center`}>
                                  <span className="text-[7px] font-bold text-white">{(c.display_name || "U")[0].toUpperCase()}</span>
                                </div>
                                <span className="text-[11px] text-muted-foreground/30">
                                  {formatRelativeTime(c.created_at)} · {formatDate(c.created_at)}
                                </span>
                              </div>
                            </div>
                            <p className="text-[12px] text-muted-foreground/50 mt-1">{c.content}</p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Funnel event (stage change) */}
                    {activePipeline && currentStage && (
                      <div className="flex gap-4 py-3.5 relative">
                        <div className="relative z-10">
                          <div className="h-7 w-7 rounded-full bg-teal-500 flex items-center justify-center ring-[3px] ring-background">
                            <DollarSign className="h-3 w-3 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[13px] font-semibold text-foreground/80">Funil: {activePipeline.name}</span>
                              <p className="text-[11px] text-muted-foreground/60 mt-0.5">Etapa atual: {currentStage.name}</p>
                            </div>
                            <span className="text-[11px] text-muted-foreground/30">{formatRelativeTime(lead.updated_at)} · {formatDate(lead.updated_at)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Lead creation event */}
                    <div className="flex gap-4 py-3.5 relative">
                      <div className="relative z-10">
                        <div className="h-7 w-7 rounded-full bg-muted-foreground/20 flex items-center justify-center ring-[3px] ring-background">
                          <Plus className="h-3 w-3 text-muted-foreground/60" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[13px] font-semibold text-foreground/60">Projeto criado</span>
                            <p className="text-[11px] text-muted-foreground/30 mt-0.5">Título: {lead.name}</p>
                          </div>
                          <span className="text-[11px] text-muted-foreground/30">{formatRelativeTime(lead.created_at)} · {formatDate(lead.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {comments.length === 0 && !activePipeline && (
                    <div className="py-8 text-center">
                      <div className="h-12 w-12 rounded-2xl bg-muted/10 flex items-center justify-center mx-auto mb-3">
                        <MessageSquare className="h-5 w-5 text-muted-foreground/15" strokeWidth={1.5} />
                      </div>
                      <p className="text-[12px] text-muted-foreground/30 font-medium">Nenhuma atividade</p>
                    </div>
                  )}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
      )}
    </>
  );

  if (fullPage) {
    return (
      <div className="w-full h-full bg-background flex flex-col overflow-hidden">
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: "100%", opacity: 0.8 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0.8 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative ml-auto w-full max-w-[1100px] bg-background flex flex-col h-full overflow-hidden border-l border-border/10 shadow-2xl"
      >
        {innerContent}
      </motion.div>
    </div>
  );
}
