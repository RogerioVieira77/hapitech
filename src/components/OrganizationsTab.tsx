import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllPlans, Plan } from "@/hooks/usePlan";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Search, X, Building2, Crown, Shield, User, Zap, Users,
  ChevronDown, Plus, Trash2, Coins, ArrowUpRight, ArrowDownRight, History,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Org {
  id: string;
  name: string;
  owner_id: string;
  plan_id: string | null;
  subscription_status: string;
  billing_period: string;
  created_at: string;
}

interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  display_name?: string | null;
  email?: string | null;
}

interface Transaction {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string | null;
  created_at: string;
}

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const roleIcons: Record<string, { icon: typeof Crown; color: string; label: string }> = {
  owner: { icon: Crown, label: "Dono", color: "text-amber-400" },
  admin: { icon: Shield, label: "Admin", color: "text-primary" },
  member: { icon: User, label: "Membro", color: "text-muted-foreground" },
};

export function OrganizationsTab({ users }: { users: { id: string; email: string; display_name: string | null }[] }) {
  const { data: plans } = useAllPlans();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgMembers, setOrgMembers] = useState<Record<string, OrgMember[]>>({});
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [deletingOrg, setDeletingOrg] = useState<string | null>(null);
  const [addMemberOrg, setAddMemberOrg] = useState<string | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createOwner, setCreateOwner] = useState("");
  const [orgCredits, setOrgCredits] = useState<Record<string, number>>({});
  const [creditInput, setCreditInput] = useState<Record<string, string>>({});
  const [creditOp, setCreditOp] = useState<Record<string, string>>({});
  const [confirmCredit, setConfirmCredit] = useState<{ orgId: string; ownerId: string; amount: number; op: string } | null>(null);
  const [orgTransactions, setOrgTransactions] = useState<Record<string, Transaction[]>>({});
  const [loadingTx, setLoadingTx] = useState<string | null>(null);

  useEffect(() => {
    loadOrgs();
  }, []);

  useEffect(() => {
    if (orgs.length > 0) loadAllCredits();
  }, [orgs]);

  const loadOrgs = async () => {
    const { data } = await supabase.from("organizations" as any).select("*").order("created_at", { ascending: false });
    if (data) setOrgs(data as any as Org[]);
  };

  const loadAllCredits = async () => {
    const ownerIds = orgs.map((o) => o.owner_id);
    if (ownerIds.length === 0) return;
    const { data } = await supabase
      .from("user_credits")
      .select("user_id, balance")
      .in("user_id", ownerIds);
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((c) => { map[c.user_id] = c.balance; });
      setOrgCredits(map);
    }
  };

  const requestApplyCredits = (orgId: string, ownerId: string) => {
    const amount = parseInt(creditInput[orgId] || "0");
    const operation = creditOp[orgId] || "add";
    if (!amount || amount <= 0) return;
    setConfirmCredit({ orgId, ownerId, amount, op: operation });
  };

  const applyCredits = async () => {
    if (!confirmCredit) return;
    const { orgId, ownerId, amount, op } = confirmCredit;
    setProcessing(orgId);
    setConfirmCredit(null);
    try {
      const { error } = await (supabase.rpc as any)("set_user_credits", {
        _user_id: ownerId,
        _amount: amount,
        _operation: op,
        _description: `Ajuste via organização (${op})`,
      });
      if (error) throw error;
      toast.success("Créditos atualizados!");
      setCreditInput((p) => ({ ...p, [orgId]: "" }));
      await loadAllCredits();
      await loadTransactions(ownerId);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const loadTransactions = async (ownerId: string) => {
    setLoadingTx(ownerId);
    try {
      const { data } = await (supabase as any)
        .from("credit_transactions")
        .select("id, amount, balance_after, type, description, created_at")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (data) {
        setOrgTransactions((prev) => ({ ...prev, [ownerId]: data as Transaction[] }));
      }
    } finally {
      setLoadingTx(null);
    }
  };

  const loadMembers = async (orgId: string) => {
    try {
      const { data, error } = await (supabase.rpc as any)("get_org_members_for_admin", { _org_id: orgId });
      if (error) throw error;
      const members = (data || []) as OrgMember[];
      setOrgMembers((prev) => ({ ...prev, [orgId]: members }));
    } catch (e: any) {
      console.error("Failed to load members:", e);
      setOrgMembers((prev) => ({ ...prev, [orgId]: [] }));
    }
  };

  const toggleExpand = (orgId: string) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
    } else {
      setExpandedOrg(orgId);
      const org = orgs.find((o) => o.id === orgId);
      if (!orgMembers[orgId]) loadMembers(orgId);
      if (org && !orgTransactions[org.owner_id]) loadTransactions(org.owner_id);
    }
  };

  const assignPlan = async (orgId: string, planId: string) => {
    setProcessing(orgId);
    try {
      const plan = plans?.find((p) => p.id === planId);
      const now = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);

      const { error } = await supabase
        .from("organizations" as any)
        .update({
          plan_id: planId,
          subscription_status: "active",
          current_period_start: now.toISOString(),
          current_period_end: endDate.toISOString(),
        } as any)
        .eq("id", orgId);
      if (error) throw error;

      // Add credits to owner
      const org = orgs.find((o) => o.id === orgId);
      if (plan && org) {
        await (supabase.rpc as any)("set_user_credits", {
          _user_id: org.owner_id,
          _amount: plan.monthly_credits,
          _operation: "add",
          _description: `Créditos do plano ${plan.name}`,
        });
      }

      toast.success("Plano atribuído à organização!");
      await loadOrgs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const removePlan = async (orgId: string) => {
    setProcessing(orgId);
    try {
      const { error } = await supabase
        .from("organizations" as any)
        .update({ plan_id: null, subscription_status: "inactive" } as any)
        .eq("id", orgId);
      if (error) throw error;
      toast.success("Plano removido!");
      await loadOrgs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const deleteOrg = async (orgId: string) => {
    setProcessing(orgId);
    try {
      // Delete members first to avoid FK constraint violation
      await supabase.from("organization_members" as any).delete().eq("organization_id", orgId);
      const { error } = await supabase.from("organizations" as any).delete().eq("id", orgId);
      if (error) throw error;
      toast.success("Organização excluída!");
      setDeletingOrg(null);
      await loadOrgs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const addMember = async () => {
    if (!addMemberOrg || !newMemberEmail) return;
    const u = users.find((u) => u.email.toLowerCase() === newMemberEmail.toLowerCase());
    if (!u) {
      toast.error("Usuário não encontrado");
      return;
    }
    setProcessing(addMemberOrg);
    try {
      const { error } = await supabase.from("organization_members" as any).insert({
        organization_id: addMemberOrg,
        user_id: u.id,
        role: newMemberRole,
      } as any);
      if (error) throw error;
      toast.success("Membro adicionado!");
      setAddMemberOrg(null);
      setNewMemberEmail("");
      setNewMemberRole("member");
      await loadMembers(addMemberOrg);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(null);
    }
  };

  const removeMember = async (memberId: string, orgId: string) => {
    try {
      const { error } = await supabase.from("organization_members" as any).delete().eq("id", memberId);
      if (error) throw error;
      toast.success("Membro removido!");
      await loadMembers(orgId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const createOrg = async () => {
    if (!createName.trim() || !createOwner) return;
    try {
      const { data: org, error } = await supabase
        .from("organizations" as any)
        .insert({ name: createName.trim(), owner_id: createOwner } as any)
        .select()
        .single();
      if (error) throw error;

      // Add owner as member
      await supabase.from("organization_members" as any).insert({
        organization_id: (org as any).id,
        user_id: createOwner,
        role: "owner",
      } as any);

      toast.success("Organização criada!");
      setCreateOpen(false);
      setCreateName("");
      setCreateOwner("");
      await loadOrgs();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <Input
            placeholder="Buscar organização..."
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
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 text-xs rounded-xl h-9">
          <Plus className="h-3.5 w-3.5" /> Nova Organização
        </Button>
      </div>

      <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-3 border-b border-border/10 bg-secondary/10">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Organização</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Plano</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Créditos</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Membros</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">Ações</span>
        </div>

        <div className="divide-y divide-border/8">
          <AnimatePresence>
            {filtered.map((org) => {
              const currentPlan = plans?.find((p) => p.id === org.plan_id);
              const members = orgMembers[org.id];
              const ownerUser = users.find((u) => u.id === org.owner_id);
              const isExpanded = expandedOrg === org.id;

              return (
                <div key={org.id}>
                  <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-6 py-3 hover:bg-secondary/10 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(org.id)}
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-primary/70" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground/80 truncate">{org.name}</p>
                        <p className="text-[11px] text-muted-foreground/40 truncate">
                          Dono: {ownerUser?.display_name || ownerUser?.email || org.owner_id.slice(0, 8)}
                        </p>
                      </div>
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

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {orgCredits[org.owner_id] !== undefined ? (() => {
                        const balance = orgCredits[org.owner_id];
                        const plan = plans?.find((p) => p.id === org.plan_id);
                        const monthlyCredits = plan?.monthly_credits || 0;
                        const isLow = monthlyCredits > 0 && balance < monthlyCredits * 0.15;
                        const isCritical = monthlyCredits > 0 && balance < monthlyCredits * 0.05;
                        const isEmpty = balance === 0;
                        
                        const badgeClass = isEmpty
                          ? "bg-destructive/15 text-destructive border-destructive/20"
                          : isCritical
                          ? "bg-destructive/10 text-destructive/80 border-destructive/15"
                          : isLow
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/15"
                          : "bg-primary/10 text-primary border-primary/15";

                        return (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${badgeClass}`}>
                            <Coins className="h-2.5 w-2.5" />
                            {balance.toLocaleString()}
                            {isEmpty && <span className="ml-0.5">⚠</span>}
                          </span>
                        );
                      })() : (
                        <span className="text-[11px] text-muted-foreground/30">Sem saldo</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground/40" />
                      <span className="text-[11px] text-muted-foreground/50">{members?.length ?? "—"}</span>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {processing === org.id ? (
                        <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                      ) : (
                        <>
                          <select
                            className="text-[11px] bg-secondary/30 border border-border/15 rounded-lg px-2 py-1.5 text-foreground/70"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) assignPlan(org.id, e.target.value);
                            }}
                          >
                            <option value="">Atribuir plano</option>
                            {plans?.filter((p) => p.is_active).map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {currentPlan && (
                            <button
                              onClick={() => removePlan(org.id)}
                              className="text-[10px] px-2 py-1.5 rounded-lg bg-destructive/10 text-destructive/70 hover:bg-destructive/20 border border-destructive/15 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={() => setAddMemberOrg(org.id)}
                            className="text-[10px] px-2 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/15 transition-colors"
                            title="Adicionar membro"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setDeletingOrg(org.id)}
                            className="text-[10px] px-2 py-1.5 rounded-lg bg-destructive/10 text-destructive/70 hover:bg-destructive/20 border border-destructive/15 transition-colors"
                            title="Excluir organização"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>

                  {/* Expanded members list */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-secondary/5 border-t border-border/8"
                      >
                        <div className="px-10 py-3 space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium mb-2">Membros</p>
                          {members?.map((m) => {
                            const rc = roleIcons[m.role] ?? roleIcons.member;
                            const RoleIcon = rc.icon;
                            return (
                              <div key={m.id} className="flex items-center gap-3 py-1.5">
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-[9px] bg-secondary/30">{getInitials(m.display_name)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <span className="text-[12px] text-foreground/70 truncate block">
                                    {m.display_name || "Sem nome"}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/40 truncate block">
                                    {m.email || m.user_id.slice(0, 8)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <RoleIcon className={`h-3 w-3 ${rc.color}`} />
                                  <span className={`text-[10px] ${rc.color}`}>{rc.label}</span>
                                </div>
                                {m.role !== "owner" && (
                                  <button
                                    onClick={() => removeMember(m.id, org.id)}
                                    className="text-destructive/50 hover:text-destructive transition-colors"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {!members && (
                            <div className="flex justify-center py-3">
                              <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                            </div>
                          )}
                          {members?.length === 0 && (
                            <p className="text-[11px] text-muted-foreground/30 py-2">Nenhum membro</p>
                          )}

                          {/* Credit management */}
                          <div className="mt-4 pt-3 border-t border-border/10">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium mb-3">Gerenciar Créditos</p>
                            
                            {/* Balance indicator */}
                            {(() => {
                              const balance = orgCredits[org.owner_id] ?? 0;
                              const plan = plans?.find((p) => p.id === org.plan_id);
                              const monthlyCredits = plan?.monthly_credits || 0;
                              const pct = monthlyCredits > 0 ? Math.min((balance / monthlyCredits) * 100, 100) : 100;
                              const isLow = monthlyCredits > 0 && balance < monthlyCredits * 0.15;
                              const isCritical = monthlyCredits > 0 && balance < monthlyCredits * 0.05;
                              const isEmpty = balance === 0;
                              
                              const barColor = isEmpty || isCritical
                                ? "bg-destructive"
                                : isLow
                                ? "bg-amber-500"
                                : "bg-primary";
                              
                              const statusLabel = isEmpty
                                ? "Sem créditos"
                                : isCritical
                                ? "Créditos críticos"
                                : isLow
                                ? "Créditos baixos"
                                : "Saldo saudável";

                              const statusColor = isEmpty || isCritical
                                ? "text-destructive"
                                : isLow
                                ? "text-amber-400"
                                : "text-emerald-400";

                              return (
                                <div className="mb-3 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-semibold text-foreground/70 tabular-nums">
                                      {balance.toLocaleString()} créditos
                                    </span>
                                    <span className={`text-[10px] font-medium ${statusColor}`}>
                                      {statusLabel}
                                    </span>
                                  </div>
                                  {monthlyCredits > 0 && (
                                    <div className="h-1.5 w-full rounded-full bg-secondary/40 overflow-hidden">
                                      <motion.div
                                        className={`h-full rounded-full ${barColor}`}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                      />
                                    </div>
                                  )}
                                  {monthlyCredits > 0 && (
                                    <p className="text-[10px] text-muted-foreground/30">
                                      {pct.toFixed(0)}% do plano ({monthlyCredits.toLocaleString()} créditos/mês)
                                    </p>
                                  )}
                                </div>
                              );
                            })()}

                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                placeholder="Quantidade"
                                value={creditInput[org.id] || ""}
                                onChange={(e) => setCreditInput((p) => ({ ...p, [org.id]: e.target.value }))}
                                className="h-8 w-28 text-[12px] bg-secondary/20 border-border/15 rounded-lg"
                              />
                              <select
                                value={creditOp[org.id] || "add"}
                                onChange={(e) => setCreditOp((p) => ({ ...p, [org.id]: e.target.value }))}
                                className="text-[11px] bg-secondary/30 border border-border/15 rounded-lg px-2 py-1.5 text-foreground/70 h-8"
                              >
                                <option value="add">Adicionar</option>
                                <option value="subtract">Subtrair</option>
                                <option value="set">Definir</option>
                              </select>
                              <Button
                                size="sm"
                                className="h-8 text-[11px] px-3"
                                onClick={() => requestApplyCredits(org.id, org.owner_id)}
                                disabled={!creditInput[org.id] || parseInt(creditInput[org.id]) <= 0}
                              >
                                Aplicar
                              </Button>
                            </div>

                            {/* Transaction history */}
                            <div className="mt-4 pt-3 border-t border-border/10">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium flex items-center gap-1.5">
                                  <History className="h-3 w-3" /> Histórico de Transações
                                </p>
                                <button
                                  onClick={() => loadTransactions(org.owner_id)}
                                  className="text-[10px] text-primary/60 hover:text-primary transition-colors"
                                >
                                  Atualizar
                                </button>
                              </div>

                              {loadingTx === org.owner_id && (
                                <div className="flex justify-center py-4">
                                  <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                                </div>
                              )}

                              {orgTransactions[org.owner_id] && orgTransactions[org.owner_id].length > 0 ? (
                                <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                                  {orgTransactions[org.owner_id].map((tx) => {
                                    const isPositive = tx.amount > 0;
                                    return (
                                      <div
                                        key={tx.id}
                                        className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-secondary/10 transition-colors"
                                      >
                                        <div className={`flex h-5 w-5 items-center justify-center rounded-md shrink-0 ${
                                          isPositive ? "bg-emerald-500/10" : "bg-destructive/10"
                                        }`}>
                                          {isPositive ? (
                                            <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                                          ) : (
                                            <ArrowDownRight className="h-3 w-3 text-destructive/70" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[11px] text-foreground/70 truncate">
                                            {tx.description || tx.type}
                                          </p>
                                          <p className="text-[9px] text-muted-foreground/30">
                                            {new Date(tx.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                          </p>
                                        </div>
                                        <span className={`text-[11px] font-semibold tabular-nums ${
                                          isPositive ? "text-emerald-400" : "text-destructive/70"
                                        }`}>
                                          {isPositive ? "+" : ""}{tx.amount.toLocaleString()}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground/25 tabular-nums w-12 text-right">
                                          → {tx.balance_after.toLocaleString()}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : orgTransactions[org.owner_id] && orgTransactions[org.owner_id].length === 0 ? (
                                <p className="text-[11px] text-muted-foreground/30 py-3 text-center">Nenhuma transação registrada</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Building2 className="h-8 w-8 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/40">Nenhuma organização encontrada</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete org dialog */}
      <AlertDialog open={!!deletingOrg} onOpenChange={(open) => !open && setDeletingOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir organização</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Isso removerá a organização e todos os seus membros. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingOrg && deleteOrg(deletingOrg)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add member dialog */}
      <Dialog open={!!addMemberOrg} onOpenChange={(open) => !open && setAddMemberOrg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Email do usuário..."
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              className="bg-secondary/20 border-border/15 text-[13px]"
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              className="w-full text-[13px] bg-secondary/30 border border-border/15 rounded-xl px-3 py-2 text-foreground/70"
            >
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddMemberOrg(null)}>Cancelar</Button>
            <Button onClick={addMember} disabled={!newMemberEmail}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm credit change dialog */}
      <AlertDialog open={!!confirmCredit} onOpenChange={(open) => !open && setConfirmCredit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ajuste de créditos</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCredit && (() => {
                const orgName = orgs.find((o) => o.id === confirmCredit.orgId)?.name || "";
                const opLabels: Record<string, string> = { add: "Adicionar", subtract: "Subtrair", set: "Definir para" };
                const currentBalance = orgCredits[confirmCredit.ownerId] ?? 0;
                const newBalance = confirmCredit.op === "set"
                  ? confirmCredit.amount
                  : confirmCredit.op === "subtract"
                  ? Math.max(0, currentBalance - confirmCredit.amount)
                  : currentBalance + confirmCredit.amount;
                return (
                  <span className="block space-y-2">
                    <span className="block">
                      <strong>{opLabels[confirmCredit.op]}</strong> {confirmCredit.amount.toLocaleString()} créditos na organização <strong>{orgName}</strong>.
                    </span>
                    <span className="block text-[12px] mt-2">
                      Saldo atual: <strong>{currentBalance.toLocaleString()}</strong> → Novo saldo: <strong>{newBalance.toLocaleString()}</strong>
                    </span>
                  </span>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={applyCredits}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create org dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Organização</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Nome da organização..."
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="bg-secondary/20 border-border/15 text-[13px]"
            />
            <select
              value={createOwner}
              onChange={(e) => setCreateOwner(e.target.value)}
              className="w-full text-[13px] bg-secondary/30 border border-border/15 rounded-xl px-3 py-2 text-foreground/70"
            >
              <option value="">Selecionar dono...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name || u.email}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createOrg} disabled={!createName.trim() || !createOwner}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
