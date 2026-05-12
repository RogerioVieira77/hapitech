import { useState, useEffect } from "react";
import { X, User, Clock, Send, Trash2, Ban, UserCheck, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Conversation } from "@/hooks/useChat";

interface Props {
  conversation: Conversation & { contact_email?: string | null; crm_stage?: string | null; assigned_to?: string | null; is_blocked?: boolean };
  onClose: () => void;
}

export default function ContactDetailPanel({ conversation, onClose }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"geral" | "timeline">("geral");

  // Form state
  const [name, setName] = useState(conversation.contact_name || "");
  const [email, setEmail] = useState((conversation as any).contact_email || "");
  const [phone, setPhone] = useState(conversation.contact_phone || "");
  const [stage, setStage] = useState((conversation as any).crm_stage || "");
  const [saving, setSaving] = useState(false);

  // Notes
  const [noteText, setNoteText] = useState("");

  // Search for existing lead in CRM
  const { data: existingLead } = useQuery({
    queryKey: ["existing-lead-for-contact", conversation.id, conversation.contact_phone, conversation.contact_name],
    queryFn: async () => {
      if (!user) return null;
      const conditions: string[] = [];
      if (conversation.contact_phone) conditions.push(`phone.eq.${conversation.contact_phone}`);
      if (conversation.contact_name) conditions.push(`name.eq.${conversation.contact_name}`);
      if (conditions.length === 0) return null;
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", user.id)
        .or(conditions.join(","))
        .limit(1)
        .maybeSingle();
      return data || null;
    },
    enabled: !!user,
  });

  // Fetch ALL leads matching this contact (for CRM funnels section)
  const { data: contactLeads } = useQuery({
    queryKey: ["contact-leads-all", conversation.id, conversation.contact_phone, conversation.contact_name, (conversation as any).contact_email],
    queryFn: async () => {
      if (!user) return [];
      const conditions: string[] = [];
      const rawPhone = conversation.contact_phone?.replace(/\D/g, "") || "";
      if (rawPhone.length >= 8) {
        // Match last 8+ digits for flexible phone matching
        conditions.push(`phone.ilike.%${rawPhone.slice(-8)}%`);
      }
      if (conversation.contact_name) conditions.push(`name.ilike.%${conversation.contact_name}%`);
      const contactEmail = (conversation as any).contact_email;
      if (contactEmail) conditions.push(`email.ilike.%${contactEmail}%`);
      if (conditions.length === 0) return [];
      const { data } = await supabase
        .from("leads")
        .select("id, name, stage, value, priority, created_at, company")
        .eq("user_id", user.id)
        .or(conditions.join(","));
      return data || [];
    },
    enabled: !!user,
  });

  // Sync when conversation changes or existing lead is found
  useEffect(() => {
    setName(conversation.contact_name || "");
    setEmail((conversation as any).contact_email || "");
    setPhone(conversation.contact_phone || "");
    setStage(existingLead?.stage || (conversation as any).crm_stage || "");
  }, [conversation.id, existingLead]);

  // Fetch pipelines
  const { data: pipelines } = useQuery({
    queryKey: ["crm-pipelines-panel", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_pipelines")
        .select("id, name, position")
        .order("position", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  // Selected pipeline for stage filtering
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

  // Fetch CRM stages
  const { data: allStages } = useQuery({
    queryKey: ["crm-stages-panel", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_stages")
        .select("id, name, slug, pipeline_id")
        .order("position", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  // Auto-select pipeline
  useEffect(() => {
    if (existingLead?.stage && allStages && allStages.length > 0) {
      const matchingStage = allStages.find(s => s.slug === existingLead.stage);
      if (matchingStage?.pipeline_id) {
        setSelectedPipelineId(matchingStage.pipeline_id);
        return;
      }
    }
    if (pipelines && pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id);
    }
  }, [pipelines, allStages, existingLead]);

  const stages = (allStages || []).filter(s => s.pipeline_id === selectedPipelineId);

  // Helper: resolve stage slug to pipeline name + stage name
  const resolveStageInfo = (stageSlug: string) => {
    const stageObj = allStages?.find(s => s.slug === stageSlug);
    if (!stageObj) return { pipelineName: "—", stageName: stageSlug };
    const pipeline = pipelines?.find(p => p.id === stageObj.pipeline_id);
    return { pipelineName: pipeline?.name || "—", stageName: stageObj.name };
  };

  // Fetch notes
  const { data: notes } = useQuery({
    queryKey: ["contact-notes", conversation.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_notes" as any)
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as { id: string; content: string; created_at: string; user_id: string }[];
    },
    enabled: !!user,
  });

  // WhatsApp connection number
  const { data: whatsappConn } = useQuery({
    queryKey: ["whatsapp-conn", conversation.connection_id],
    queryFn: async () => {
      if (!conversation.connection_id) return null;
      const { data } = await supabase
        .from("wuzapi_connections")
        .select("phone_number")
        .eq("id", conversation.connection_id)
        .maybeSingle();
      return data;
    },
    enabled: !!conversation.connection_id,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("conversations")
        .update({
          contact_name: name,
          contact_phone: phone,
          contact_email: email,
          crm_stage: stage || null,
        } as any)
        .eq("id", conversation.id);
      if (error) throw error;

      if (stage && user) {
        const { data: existingLeads } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", user.id)
          .or(`phone.eq.${conversation.contact_phone || ""},name.eq.${name}`)
          .limit(1);

        if (existingLeads && existingLeads.length > 0) {
          await supabase
            .from("leads")
            .update({ stage, name, phone: phone || null, email: email || null })
            .eq("id", existingLeads[0].id);
        } else {
          await supabase
            .from("leads")
            .insert({
              user_id: user.id,
              name: name || conversation.contact_name || "Sem nome",
              phone: phone || conversation.contact_phone || null,
              email: email || null,
              stage,
              source: "contato",
            });
        }
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        queryClient.invalidateQueries({ queryKey: ["contact-leads-all"] });
      }

      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Registro atualizado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !user) return;
    try {
      const { error } = await supabase
        .from("contact_notes" as any)
        .insert({ conversation_id: conversation.id, user_id: user.id, content: noteText.trim() });
      if (error) throw error;
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["contact-notes", conversation.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await supabase.from("contact_notes" as any).delete().eq("id", noteId);
      queryClient.invalidateQueries({ queryKey: ["contact-notes", conversation.id] });
    } catch {}
  };

  const handleToggleBlock = async () => {
    const current = (conversation as any).is_blocked || false;
    await supabase.from("conversations").update({ is_blocked: !current } as any).eq("id", conversation.id);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    toast.success(current ? "Contato desbloqueado" : "Contato bloqueado");
  };

  const isBlocked = (conversation as any).is_blocked || false;
  const channelType = conversation.remote_jid?.startsWith("telegram:") ? "Telegram" : conversation.remote_jid?.endsWith("@s.whatsapp.net") ? "WhatsApp" : conversation.remote_jid?.startsWith("widget:") ? "Widget" : "Outro";

  const initials = (conversation.contact_name || "?")
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="w-[300px] lg:w-[320px] flex-shrink-0 flex flex-col bg-card border-l border-border/8 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={() => setActiveTab("geral")}
            className={`text-[13px] font-semibold pb-0.5 transition-colors ${activeTab === "geral" ? "text-primary border-b-2 border-primary" : "text-muted-foreground/50 hover:text-foreground"}`}
          >
            Geral
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`text-[13px] font-semibold pb-0.5 transition-colors ${activeTab === "timeline" ? "text-primary border-b-2 border-primary" : "text-muted-foreground/50 hover:text-foreground"}`}
          >
            Linha do tempo
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 text-[11px] rounded-md">
            Arquivar
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/40" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {activeTab === "geral" ? (
          <div className="p-4 space-y-5">
            {/* Large profile photo */}
            <div className="flex flex-col items-center gap-2 py-2">
              {conversation.profile_picture_url ? (
                <img
                  src={conversation.profile_picture_url}
                  alt={conversation.contact_name || "Contato"}
                  className="h-20 w-20 rounded-full object-cover border-2 border-border/20"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-border/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary/60">{initials}</span>
                </div>
              )}
              <p className="text-[15px] font-semibold text-foreground/90">{conversation.contact_name || "Sem nome"}</p>
              {conversation.contact_phone && (
                <p className="text-[12px] text-muted-foreground/50">{conversation.contact_phone}</p>
              )}
            </div>

            {/* Info form */}
            <div className="rounded-xl border border-border/15 p-4 space-y-4">
              <h4 className="text-[13px] font-semibold text-foreground/80">Informações gerais</h4>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground/60 mb-1 block">
                    <span className="text-destructive">*</span> Nome
                  </label>
                  <Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-[13px]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground/60 mb-1 block">E-mail</label>
                    <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com.br" className="h-9 text-[13px]" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground/60 mb-1 block">Telefone</label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-9 text-[13px]" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground/60 mb-1 block">Funil</label>
                  <Select value={selectedPipelineId} onValueChange={(v) => { setSelectedPipelineId(v); setStage(""); }}>
                    <SelectTrigger className="h-9 text-[13px]">
                      <SelectValue placeholder="Selecione o funil" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground/60 mb-1 block">Etapa</label>
                  <Select value={stage} onValueChange={setStage}>
                    <SelectTrigger className="h-9 text-[13px]">
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages?.map(s => (
                        <SelectItem key={s.id} value={s.slug}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-center pt-1">
                <Button onClick={handleSave} disabled={saving} className="h-9 px-6 text-[13px] font-medium">
                  {saving ? "Salvando..." : "Atualizar Registro"}
                </Button>
              </div>
            </div>

            {/* CRM Funnels section - always visible */}
            <div className="rounded-xl border border-border/15 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary/60" />
                <h4 className="text-[13px] font-semibold text-foreground/80">Funis CRM</h4>
              </div>
              {contactLeads && contactLeads.length > 0 ? (
                <div className="space-y-2">
                  {contactLeads.map(lead => {
                    const info = resolveStageInfo(lead.stage);
                    return (
                      <div key={lead.id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-muted/20 border border-border/10">
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-foreground/80 truncate">{(lead as any).company || lead.name}</p>
                          <p className="text-[11px] text-primary/70 font-medium truncate">{info.pipelineName}</p>
                          <p className="text-[10px] text-muted-foreground/50 truncate">Etapa: {info.stageName}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {lead.value != null && lead.value > 0 && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              R$ {lead.value.toLocaleString("pt-BR")}
                            </Badge>
                          )}
                          {lead.priority && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                              lead.priority === 'alta' ? 'bg-red-500/15 text-red-600' :
                              lead.priority === 'media' ? 'bg-amber-500/15 text-amber-600' :
                              'bg-emerald-500/15 text-emerald-600'
                            }`}>
                              {lead.priority === 'alta' ? 'Alta' : lead.priority === 'media' ? 'Média' : 'Baixa'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground/40 text-center py-3">Nenhum funil vinculado a este contato</p>
              )}
            </div>

            {/* Actions sidebar */}
            <div className="space-y-3">
              <h4 className="text-[13px] font-semibold text-foreground/80">Ações</h4>
              <div className="space-y-1">
                <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-foreground/70 hover:bg-muted/30 transition-colors">
                  <UserCheck className="h-4 w-4 text-muted-foreground/50" />
                  Responsável
                </button>
                <button
                  onClick={handleToggleBlock}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-colors ${isBlocked ? "text-destructive hover:bg-destructive/10" : "text-foreground/70 hover:bg-muted/30"}`}
                >
                  <Ban className="h-4 w-4" />
                  {isBlocked ? "Desbloquear" : "Bloquear"}
                </button>
              </div>
            </div>

            {/* Channel info */}
            <div className="space-y-3">
              <h4 className="text-[13px] font-semibold text-foreground/80">{channelType}</h4>
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-muted/20 border border-border/10">
                <div className="h-7 w-7 rounded bg-muted/40 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground/50">Conversar usando:</p>
                  <p className="text-[13px] font-medium text-foreground/80">
                    {whatsappConn?.phone_number || conversation.contact_phone || conversation.remote_jid?.replace("@s.whatsapp.net", "").replace("telegram:", "")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Timeline tab */
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Novo comentário"
                className="text-[13px] min-h-[80px] resize-none"
              />
              <div className="flex justify-end">
                <Button onClick={handleAddNote} disabled={!noteText.trim()} size="sm" className="h-8 px-4 text-[12px]">
                  Comentar
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {notes?.length === 0 && (
                <p className="text-[12px] text-muted-foreground/40 text-center py-6">Nenhum comentário ainda</p>
              )}
              {notes?.map(note => (
                <div key={note.id} className="rounded-lg border border-border/15 p-3 group">
                  <p className="text-[13px] text-foreground/80 whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-muted-foreground/40 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(note.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      {" "}
                      {new Date(note.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-destructive transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}