import { useState, useEffect } from "react";
import {
  ArrowLeft, Plus, X, Mail, Phone, MessageSquare, CalendarCheck,
  FileText, Bell, UserCheck, Clock, ChevronDown, Trash2, Pencil, Check,
  Zap, MoreHorizontal, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CrmStage } from "@/hooks/useCrmStages";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";

const ACTION_TYPES = [
  { value: "email", label: "Enviar email", icon: Mail, color: "bg-blue-500/10 text-blue-500" },
  { value: "call", label: "Ligar para cliente", icon: Phone, color: "bg-emerald-500/10 text-emerald-500" },
  { value: "task", label: "Criar tarefa", icon: Check, color: "bg-violet-500/10 text-violet-500" },
  { value: "notification", label: "Notificação", icon: Bell, color: "bg-amber-500/10 text-amber-500" },
  { value: "comment", label: "Comentário", icon: MessageSquare, color: "bg-pink-500/10 text-pink-500" },
  { value: "meeting", label: "Reunião", icon: CalendarCheck, color: "bg-teal-500/10 text-teal-500" },
  { value: "proposal", label: "Proposta", icon: FileText, color: "bg-orange-500/10 text-orange-500" },
  { value: "assign", label: "Atribuir responsável", icon: UserCheck, color: "bg-indigo-500/10 text-indigo-500" },
];

const TRIGGER_TYPES = [
  { value: "immediately", label: "Imediatamente" },
  { value: "after_previous", label: "Após anterior" },
  { value: "1d_after_previous", label: "Em 1 dia, após anterior" },
  { value: "2d_after_previous", label: "Em 2 dias, após anterior" },
  { value: "3d_after_previous", label: "Em 3 dias, após anterior" },
  { value: "5d_after_previous", label: "Em 5 dias, após anterior" },
  { value: "7d_after_previous", label: "Em 7 dias, após anterior" },
];

interface AutomationRule {
  id: string;
  stage_slug: string;
  pipeline_id: string;
  action_type: string;
  action_label: string;
  trigger_type: string;
  position: number;
  user_id: string;
  created_at: string;
}

interface Props {
  pipelineId: string | null;
  stages: CrmStage[];
  onBack: () => void;
}

export default function CrmAutomationView({ pipelineId, stages, onBack }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingRule, setEditingRule] = useState<Partial<AutomationRule> | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["crm-automation-rules", pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];
      const { data, error } = await supabase
        .from("crm_automation_rules" as any)
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as AutomationRule[];
    },
    enabled: !!user && !!pipelineId,
  });

  const getRulesForStage = (stageSlug: string) =>
    rules.filter(r => r.stage_slug === stageSlug);

  const handleSaveRule = async () => {
    if (!editingRule || !user || !pipelineId) return;
    try {
      if (editingRule.id) {
        const { error } = await supabase
          .from("crm_automation_rules" as any)
          .update({
            action_type: editingRule.action_type,
            action_label: editingRule.action_label,
            trigger_type: editingRule.trigger_type,
          } as any)
          .eq("id", editingRule.id);
        if (error) throw error;
        toast.success("Regra atualizada");
      } else {
        const stageRules = getRulesForStage(editingRule.stage_slug || "");
        const { error } = await supabase
          .from("crm_automation_rules" as any)
          .insert({
            pipeline_id: pipelineId,
            stage_slug: editingRule.stage_slug,
            action_type: editingRule.action_type || "task",
            action_label: editingRule.action_label || "",
            trigger_type: editingRule.trigger_type || "immediately",
            position: stageRules.length,
            user_id: user.id,
          } as any);
        if (error) throw error;
        toast.success("Regra criada");
      }
      queryClient.invalidateQueries({ queryKey: ["crm-automation-rules", pipelineId] });
      setShowDialog(false);
      setEditingRule(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await supabase.from("crm_automation_rules" as any).delete().eq("id", ruleId);
      queryClient.invalidateQueries({ queryKey: ["crm-automation-rules", pipelineId] });
      toast.success("Regra removida");
    } catch {}
  };

  const openNewRule = (stageSlug: string) => {
    setEditingRule({ stage_slug: stageSlug, action_type: "task", trigger_type: "immediately", action_label: "" });
    setShowDialog(true);
  };

  const openEditRule = (rule: AutomationRule) => {
    setEditingRule(rule);
    setShowDialog(true);
  };

  const getActionInfo = (type: string) => ACTION_TYPES.find(a => a.value === type) || ACTION_TYPES[0];
  const getTriggerLabel = (type: string) => TRIGGER_TYPES.find(t => t.value === type)?.label || type;

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/20 transition-all">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" strokeWidth={1.5} />
              Automação
            </h1>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5">Regras executadas automaticamente quando um lead entra em cada etapa</p>
          </div>
        </div>
        <Button onClick={onBack} className="bg-foreground text-background hover:bg-foreground/90 rounded-xl h-9 text-xs">Voltar</Button>
      </div>

      {/* Kanban columns by stage */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage, stageIdx) => {
          const stageRules = getRulesForStage(stage.slug);
          const STAGE_COLORS = [
            "border-t-blue-500", "border-t-violet-500", "border-t-amber-500",
            "border-t-emerald-500", "border-t-pink-500", "border-t-teal-500",
            "border-t-orange-500", "border-t-indigo-500",
          ];
          const topColor = STAGE_COLORS[stageIdx % STAGE_COLORS.length];

          return (
            <div
              key={stage.id}
              className={`flex-shrink-0 w-[240px] rounded-2xl border border-border/15 bg-card overflow-hidden border-t-[3px] ${topColor}`}
            >
              {/* Column header */}
              <div className="px-4 py-3 border-b border-border/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-foreground truncate">{stage.name}</h3>
                  {stageRules.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/30 bg-muted/10 px-1.5 py-0.5 rounded-md">
                      {stageRules.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Rules list */}
              <div className="p-3 space-y-2.5 min-h-[120px]">
                <AnimatePresence>
                  {stageRules.map(rule => {
                    const action = getActionInfo(rule.action_type);
                    const ActionIcon = action.icon;
                    return (
                      <motion.div
                        key={rule.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="rounded-xl border border-border/10 bg-background p-3 group relative"
                      >
                        {/* Delete button */}
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-foreground/20 hover:text-destructive transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>

                        {/* Trigger timing */}
                        <div className="flex items-center gap-1.5 mb-2">
                          <Clock className="h-3 w-3 text-muted-foreground/25" strokeWidth={1.5} />
                          <span className="text-[10px] text-muted-foreground/60 font-medium">
                            {getTriggerLabel(rule.trigger_type)}
                          </span>
                        </div>

                        {/* Action */}
                        <div className="flex items-center gap-2">
                          <div className={`h-5 w-5 rounded-md flex items-center justify-center ${action.color} shrink-0`}>
                            <ActionIcon className="h-3 w-3" strokeWidth={2} />
                          </div>
                          <span className="text-[12px] font-medium text-foreground/80 truncate">
                            {rule.action_label || action.label}
                          </span>
                        </div>

                        {/* Edit link */}
                        <button
                          onClick={() => openEditRule(rule)}
                          className="mt-2 text-[10px] text-primary/50 hover:text-primary transition-colors font-medium"
                        >
                          Editar
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Add rule button */}
                <button
                  onClick={() => openNewRule(stage.slug)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-border/15 text-[11px] font-medium text-primary/50 hover:text-primary hover:border-primary/20 hover:bg-primary/[0.02] transition-all"
                >
                  <Plus className="h-3 w-3" />
                  Criar Regra
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit/Create Rule Dialog */}
      <Dialog open={showDialog} onOpenChange={v => { if (!v) { setShowDialog(false); setEditingRule(null); } }}>
        <DialogContent className="max-w-[460px] bg-card border-border/20 p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle className="text-[17px] font-bold">
                {editingRule?.id ? "Editar Regra" : "Nova Regra de Automação"}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 pb-6">
            {/* Stage (read-only for context) */}
            {editingRule?.stage_slug && (
              <div>
                <label className="text-[11px] font-medium text-muted-foreground/60 mb-2 block">Etapa</label>
                <div className="h-11 px-4 rounded-xl bg-muted/10 border border-border/15 flex items-center text-[13px] text-foreground font-semibold">
                  {stages.find(s => s.slug === editingRule.stage_slug)?.name || editingRule.stage_slug}
                </div>
              </div>
            )}

            {/* Trigger type */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground/60 mb-2 block">Quando executar</label>
              <Select value={editingRule?.trigger_type || "immediately"} onValueChange={v => setEditingRule(prev => prev ? { ...prev, trigger_type: v } : prev)}>
                <SelectTrigger className="h-11 text-[13px] bg-muted/5 border-border/15 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action type - visual grid */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground/60 mb-3 block">Tipo de ação</label>
              <div className="grid grid-cols-4 gap-3">
                {ACTION_TYPES.map((a, idx) => {
                  const Icon = a.icon;
                  const isSelected = editingRule?.action_type === a.value;
                  return (
                    <motion.button
                      key={a.value}
                      initial={{ opacity: 0, scale: 0.8, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: idx * 0.04, duration: 0.25, ease: "easeOut" }}
                      onClick={() => setEditingRule(prev => prev ? { ...prev, action_type: a.value } : prev)}
                      className={`flex flex-col items-center gap-2 py-3 px-1 rounded-xl border-2 transition-all duration-200 ${
                        isSelected
                          ? "border-primary/40 bg-primary/[0.06] shadow-sm shadow-primary/10"
                          : "border-transparent hover:border-border/20 hover:bg-muted/10"
                      }`}
                    >
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-transform duration-200 ${a.color} ${isSelected ? "scale-110" : ""}`}>
                        <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
                      </div>
                      <span className={`text-[10px] font-medium leading-tight text-center transition-colors ${isSelected ? "text-primary font-semibold" : "text-muted-foreground/50"}`}>
                        {a.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Action label */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground/60 mb-2 block">Descrição da ação</label>
              <Input
                value={editingRule?.action_label || ""}
                onChange={e => setEditingRule(prev => prev ? { ...prev, action_label: e.target.value } : prev)}
                placeholder="Ex: Enviar proposta comercial"
                className="h-11 text-[13px] bg-muted/5 border-border/15 rounded-xl"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-border/10">
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditingRule(null); }} className="rounded-xl h-10 px-5 text-[13px] font-medium">
                Cancelar
              </Button>
              <Button onClick={handleSaveRule} disabled={!editingRule?.action_type} className="rounded-xl h-10 px-5 text-[13px] font-semibold bg-foreground text-background hover:bg-foreground/90">
                {editingRule?.id ? "Atualizar" : "Criar Regra"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
