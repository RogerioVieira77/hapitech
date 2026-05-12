import { useState } from "react";
import { useAllPlans, Plan } from "@/hooks/usePlan";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Pencil, Trash2, Save, X, GripVertical, Crown, Zap,
} from "lucide-react";

export function PlansTab() {
  const { data: plans, isLoading } = useAllPlans();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Plan>>({});
  const [creating, setCreating] = useState(false);

  const startEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setForm({ ...plan });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({});
    setCreating(false);
  };

  const savePlan = async () => {
    try {
      if (creating) {
        const { error } = await supabase.from("plans" as any).insert({
          slug: form.slug || form.name?.toLowerCase().replace(/\s+/g, "-"),
          name: form.name,
          monthly_price: form.monthly_price || 0,
          monthly_credits: form.monthly_credits || 0,
          max_agents: form.max_agents || 1,
          max_connections: form.max_connections || 1,
          max_members: form.max_members || 5,
          features: form.features || [],
          is_active: form.is_active ?? true,
          popular: form.popular ?? false,
          position: (plans?.length ?? 0),
        });
        if (error) throw error;
        toast.success("Plano criado!");
      } else {
        const { error } = await supabase
          .from("plans" as any)
          .update({
            name: form.name,
            slug: form.slug,
            monthly_price: form.monthly_price,
            monthly_credits: form.monthly_credits,
            max_agents: form.max_agents,
            max_connections: form.max_connections,
            max_members: form.max_members,
            features: form.features,
            is_active: form.is_active,
            popular: form.popular,
          })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Plano atualizado!");
      }
      qc.invalidateQueries({ queryKey: ["all-plans"] });
      qc.invalidateQueries({ queryKey: ["plans"] });
      cancelEdit();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este plano?")) return;
    const { error } = await supabase.from("plans" as any).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plano excluído!");
    qc.invalidateQueries({ queryKey: ["all-plans"] });
    qc.invalidateQueries({ queryKey: ["plans"] });
  };

  const startCreate = () => {
    setCreating(true);
    setEditingId("new");
    setForm({
      name: "",
      slug: "",
      monthly_price: 0,
      monthly_credits: 0,
      max_agents: 1,
      max_connections: 1,
      max_members: 5,
      features: ["widget", "knowledge", "crm"],
      is_active: true,
      popular: false,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary/60" strokeWidth={1.5} />
            Gestão de Planos
          </h2>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">
            {plans?.length ?? 0} planos configurados
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={startCreate} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Novo Plano
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {/* Creating new */}
          {creating && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <PlanForm form={form} setForm={setForm} onSave={savePlan} onCancel={cancelEdit} />
            </motion.div>
          )}

          {plans?.map((plan) => (
            <motion.div
              key={plan.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {editingId === plan.id && !creating ? (
                <PlanForm form={form} setForm={setForm} onSave={savePlan} onCancel={cancelEdit} />
              ) : (
                <div className="rounded-xl border border-border/15 bg-card/40 backdrop-blur-xl p-4 flex items-center gap-4">
                  <GripVertical className="h-4 w-4 text-muted-foreground/20 shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground/80">{plan.name}</span>
                      {plan.popular && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                          Popular
                        </span>
                      )}
                      {!plan.is_active && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/20">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[11px] text-muted-foreground/50">
                      <span>R$ {plan.monthly_price}/mês</span>
                      <span>{plan.monthly_credits.toLocaleString()} créditos</span>
                      <span>{plan.max_agents} agentes</span>
                      <span>{plan.max_connections} conexões</span>
                      <span>{plan.max_members ?? 5} membros</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(plan)}
                      className="p-2 rounded-lg hover:bg-secondary/40 text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deletePlan(plan.id)}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PlanForm({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: Partial<Plan>;
  setForm: (f: Partial<Plan>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const featureOptions = [
    { key: "widget", label: "Widget Web" },
    { key: "knowledge", label: "Base de Conhecimento" },
    { key: "crm", label: "CRM" },
    { key: "calendar", label: "Google Calendar" },
    { key: "webhooks", label: "Webhooks" },
    { key: "mcp", label: "Integrações MCP" },
    { key: "voice", label: "Voz (integração com ElevenLabs)" },
    { key: "api", label: "API Completa" },
  ];

  const toggleFeature = (key: string) => {
    const current = form.features || [];
    setForm({
      ...form,
      features: current.includes(key) ? current.filter((f) => f !== key) : [...current, key],
    });
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-card/60 backdrop-blur-xl p-5 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Nome</label>
          <Input
            value={form.name || ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-8 text-xs bg-secondary/20 border-border/15"
            placeholder="Ex: Standard"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Slug</label>
          <Input
            value={form.slug || ""}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="h-8 text-xs bg-secondary/20 border-border/15"
            placeholder="standard"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Preço/mês (R$)</label>
          <Input
            type="number"
            value={form.monthly_price ?? 0}
            onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })}
            className="h-8 text-xs bg-secondary/20 border-border/15"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Créditos/mês</label>
          <Input
            type="number"
            value={form.monthly_credits ?? 0}
            onChange={(e) => setForm({ ...form, monthly_credits: Number(e.target.value) })}
            className="h-8 text-xs bg-secondary/20 border-border/15"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Máx. Agentes</label>
          <Input
            type="number"
            value={form.max_agents ?? 1}
            onChange={(e) => setForm({ ...form, max_agents: Number(e.target.value) })}
            className="h-8 text-xs bg-secondary/20 border-border/15"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Máx. Conexões</label>
          <Input
            type="number"
            value={form.max_connections ?? 1}
            onChange={(e) => setForm({ ...form, max_connections: Number(e.target.value) })}
            className="h-8 text-xs bg-secondary/20 border-border/15"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Máx. Membros</label>
          <Input
            type="number"
            value={form.max_members ?? 5}
            onChange={(e) => setForm({ ...form, max_members: Number(e.target.value) })}
            className="h-8 text-xs bg-secondary/20 border-border/15"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex items-center gap-3 pt-5">
          <Switch
            checked={form.popular ?? false}
            onCheckedChange={(v) => setForm({ ...form, popular: v })}
          />
          <span className="text-xs text-muted-foreground/60">Popular</span>
        </div>
        <div className="flex items-center gap-3 pt-5">
          <Switch
            checked={form.is_active ?? true}
            onCheckedChange={(v) => setForm({ ...form, is_active: v })}
          />
          <span className="text-xs text-muted-foreground/60">Ativo</span>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">Funcionalidades inclusas</label>
        <div className="flex flex-wrap gap-1.5">
          {featureOptions.map((f) => (
            <button
              key={f.key}
              onClick={() => toggleFeature(f.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                form.features?.includes(f.key)
                  ? "bg-primary/15 text-primary border-primary/25"
                  : "bg-secondary/20 text-muted-foreground/40 border-border/15 hover:border-border/30"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1.5 text-xs">
          <X className="h-3 w-3" />
          Cancelar
        </Button>
        <Button size="sm" onClick={onSave} className="gap-1.5 text-xs">
          <Save className="h-3 w-3" />
          Salvar
        </Button>
      </div>
    </div>
  );
}
