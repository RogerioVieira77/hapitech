import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllPlans, Plan } from "@/hooks/usePlan";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, X, Crown, UserCheck, Calendar, Zap,
} from "lucide-react";

interface UserWithSub {
  id: string;
  email: string;
  display_name: string | null;
  plan_name: string | null;
  plan_slug: string | null;
  subscription_status: string | null;
}

export function SubscriptionsTab({ users }: { users: { id: string; email: string; display_name: string | null }[] }) {
  const { data: plans } = useAllPlans();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [userSubs, setUserSubs] = useState<Record<string, { plan_id: string; status: string }>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadSubs();
  }, []);

  const loadSubs = async () => {
    const { data } = await supabase.from("user_subscriptions" as any).select("user_id, plan_id, status").eq("status", "active");
    if (data) {
      const map: Record<string, { plan_id: string; status: string }> = {};
      (data as any[]).forEach((s) => {
        map[s.user_id] = { plan_id: s.plan_id, status: s.status };
      });
      setUserSubs(map);
    }
  };

  const assignPlan = async (userId: string, planId: string) => {
    setProcessing(userId);
    try {
      // Deactivate existing
      await supabase
        .from("user_subscriptions" as any)
        .update({ status: "canceled" })
        .eq("user_id", userId)
        .eq("status", "active");

      const now = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);

      const { error } = await supabase.from("user_subscriptions" as any).insert({
        user_id: userId,
        plan_id: planId,
        status: "active",
        billing_period: "mensal",
        current_period_start: now.toISOString(),
        current_period_end: endDate.toISOString(),
      });
      if (error) throw error;

      // Add monthly credits
      const plan = plans?.find((p) => p.id === planId);
      if (plan) {
        await (supabase.rpc as any)("set_user_credits", {
          _user_id: userId,
          _amount: plan.monthly_credits,
          _operation: "add",
          _description: `Créditos do plano ${plan.name}`,
        });
      }

      toast.success("Plano atribuído com sucesso!");
      await loadSubs();
      qc.invalidateQueries({ queryKey: ["user-subscription"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const removePlan = async (userId: string) => {
    setProcessing(userId);
    try {
      await supabase
        .from("user_subscriptions" as any)
        .update({ status: "canceled" })
        .eq("user_id", userId)
        .eq("status", "active");
      toast.success("Assinatura cancelada!");
      await loadSubs();
      qc.invalidateQueries({ queryKey: ["user-subscription"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      (u.email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (u.display_name?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <Input
            placeholder="Buscar usuário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-secondary/20 border-border/15 h-9 text-[13px] rounded-xl"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-6 py-3 border-b border-border/10 bg-secondary/10">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Usuário</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Plano Atual</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Ações</span>
        </div>

        <div className="divide-y divide-border/8">
          <AnimatePresence>
            {filtered.map((u) => {
              const sub = userSubs[u.id];
              const currentPlan = plans?.find((p) => p.id === sub?.plan_id);

              return (
                <motion.div
                  key={u.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-6 py-3 hover:bg-secondary/10 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground/80 truncate">
                      {u.display_name || u.email.split("@")[0]}
                    </p>
                    <p className="text-[11px] text-muted-foreground/40 truncate">{u.email}</p>
                  </div>

                  <div>
                    {currentPlan ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20">
                        <Zap className="h-2.5 w-2.5" />
                        {currentPlan.name}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/30">Sem plano</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {processing === u.id ? (
                      <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    ) : (
                      <>
                        <select
                          className="text-[11px] bg-secondary/30 border border-border/15 rounded-lg px-2 py-1.5 text-foreground/70"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) assignPlan(u.id, e.target.value);
                          }}
                        >
                          <option value="">Atribuir plano</option>
                          {plans?.filter((p) => p.is_active).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {currentPlan && (
                          <button
                            onClick={() => removePlan(u.id)}
                            className="text-[10px] px-2 py-1.5 rounded-lg bg-destructive/10 text-destructive/70 hover:bg-destructive/20 border border-destructive/15 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
