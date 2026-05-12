import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UsersRound, UserPlus, Mail, User, MoreVertical, Link2, Trash2, Loader2, AlertTriangle, Shield, LayoutDashboard, MessageSquare, Bot, Contact, Kanban, ListTodo, Plug, BarChart3, Settings, Headset, Check, X as XIcon, Building2, Pencil, Crown, Coins, KeyRound, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization, useOrgMembers, useUpdateOrg, useRemoveOrgMember, useUpdateMemberRole } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { usePlanLimits } from "@/hooks/usePlan";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ROLES = ["user", "admin"] as const;
type Role = (typeof ROLES)[number];

const ROLE_FILTER_MAP: Record<string, Role | null> = {
  todos: null,
  gerente: "admin",
  atendente: "user",
};

const getRoleLabels = (t: (k: string) => string): Record<string, string> => ({
  user: t("teams.roleUser") || "Usuário",
  admin: t("teams.roleAdmin") || "Admin",
  super_admin: t("teams.roleSuperAdmin") || "Super Admin",
});

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

interface TeamMember {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  role: Role | null;
}

export default function Teams() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [activeRoleTab, setActiveRoleTab] = useState("todos");
  const [currentPage, setCurrentPage] = useState(1);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const perPage = 10;

  const [editingName, setEditingName] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [removingOrgMember, setRemovingOrgMember] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [passwordMember, setPasswordMember] = useState<TeamMember | null>(null);
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [showMemberPassword, setShowMemberPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const { data: orgFullData } = useOrganization();
  const { data: orgMembers } = useOrgMembers(orgFullData?.org?.id);
  const updateOrg = useUpdateOrg();
  const removeOrgMember = useRemoveOrgMember();
  const updateOrgRole = useUpdateMemberRole();

  const org = orgFullData?.org;
  const plan = orgFullData?.plan as any;
  const myRole = orgFullData?.myRole;
  const canManage = myRole === "owner" || myRole === "admin";
  const { maxMembers } = usePlanLimits();

  // Org credits (from owner)
  const { data: orgCredits } = useQuery({
    queryKey: ["org-credits", org?.owner_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_credits")
        .select("balance")
        .eq("user_id", org!.owner_id)
        .maybeSingle();
      return data?.balance ?? 0;
    },
    enabled: !!org?.owner_id,
    refetchInterval: 100_000,
  });

  // Use org ID from useOrganization() — already scoped to user's own org
  const currentUserOrgId = org?.id || null;

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["team-members", currentUserOrgId],
    queryFn: async () => {
      if (!currentUserOrgId) return [];

      // Use the DB function that is scoped to the user's own org (SECURITY DEFINER)
      const { data: orgEmails } = await (supabase.rpc as any)("get_org_members_with_email");
      const emailMap: Record<string, { email: string; last_sign_in_at: string | null }> = {};
      if (orgEmails) {
        for (const u of orgEmails) {
          emailMap[u.user_id] = { email: u.email, last_sign_in_at: u.last_sign_in_at };
        }
      }

      // Fetch org members strictly filtered by org ID
      const { data: orgMems, error: omErr } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", currentUserOrgId);
      if (omErr) throw omErr;
      if (!orgMems || orgMems.length === 0) return [];

      // Only keep members that also appear in the scoped RPC result
      const scopedUserIds = new Set(Object.keys(emailMap));
      const filteredOrgMems = orgMems.filter(m => scopedUserIds.has(m.user_id));

      const userIds = filteredOrgMems.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, created_at")
        .in("user_id", userIds);

      const orgRoleToDisplayRole = (orgRole: string): Role => {
        if (orgRole === "owner" || orgRole === "admin") return "admin";
        return "user";
      };

      return filteredOrgMems.map(om => {
        const profile = (profiles || []).find(p => p.user_id === om.user_id);
        const emailInfo = emailMap[om.user_id];
        return {
          id: om.user_id,
          email: emailInfo?.email || profile?.display_name || om.user_id,
          display_name: profile?.display_name || null,
          created_at: profile?.created_at || "",
          last_sign_in_at: emailInfo?.last_sign_in_at || (profile ? "active" : null),
          role: orgRoleToDisplayRole(om.role),
        };
      });
    },
    enabled: !!currentUserOrgId,
  });

  const memberLimitReached = members.length >= maxMembers;

  // Mutations
  const createUser = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-team-user`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ name, email, role }) }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("teams.createError"));
      return json;
    },
    onSuccess: () => { toast.success(t("teams.userCreated")); setName(""); setEmail(""); setRole("user"); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["team-members"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-team-user`,
        { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ user_id: userId }) }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao remover membro");
      return json;
    },
    onSuccess: () => { toast.success("Membro removido com sucesso"); queryClient.invalidateQueries({ queryKey: ["team-members"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: Role }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-team-user`,
        { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ user_id: userId, role: newRole }) }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao atualizar papel");
      return json;
    },
    onSuccess: () => { toast.success("Papel atualizado com sucesso"); queryClient.invalidateQueries({ queryKey: ["team-members"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const roleLabels = getRoleLabels(t);

  const handleCreate = () => {
    if (!name.trim() || !email.trim()) { toast.error(t("teams.fillAll")); return; }
    if (!email.includes("@")) { toast.error(t("teams.invalidEmail")); return; }
    createUser.mutate();
  };

  const handleCopyInviteLink = (member: TeamMember) => {
    const inviteUrl = `${window.location.origin}/auth?invite=true&email=${encodeURIComponent(member.email)}`;
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Link de convite copiado!");
  };

  const startEditName = () => { if (org) { setOrgName(org.name); setEditingName(true); } };
  const saveName = () => { if (org && orgName.trim()) { updateOrg.mutate({ id: org.id, updates: { name: orgName.trim() } }); } setEditingName(false); };

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) { toast.error("Nome e email são obrigatórios"); return; }
    setInviting(true);
    try {
      const res = await supabase.functions.invoke("invite-org-member", {
        body: { name: inviteName.trim(), email: inviteEmail.trim(), role: inviteRole },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Convite enviado com sucesso!");
      setInviteOpen(false); setInviteName(""); setInviteEmail(""); setInviteRole("member");
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    } catch (e: any) { toast.error(e.message || "Erro ao convidar membro"); } finally { setInviting(false); }
  };

  const handleChangePassword = async () => {
    if (!passwordMember || !newMemberPassword) return;
    setChangingPassword(true);
    try {
      const res = await supabase.functions.invoke("admin-change-password", {
        body: { target_user_id: passwordMember.id, new_password: newMemberPassword },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(`Senha de ${passwordMember.display_name || passwordMember.email} alterada com sucesso!`);
      setPasswordMember(null);
      setNewMemberPassword("");
      setShowMemberPassword(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar senha");
    } finally {
      setChangingPassword(false);
    }
  };

  const filterRole = ROLE_FILTER_MAP[activeRoleTab];
  const filtered = filterRole ? members.filter((m) => m.role === filterRole) : members;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const getStatus = (m: TeamMember) => {
    if (m.last_sign_in_at) return { label: t("teams.statusActive") || "Ativo", color: "text-emerald-500" };
    return { label: t("teams.statusPending") || "Pendente", color: "text-amber-500" };
  };

  return (
    <PageTransition>
      <div className="space-y-8 w-full">
        {/* Header */}
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">{t("teams.title")}</h1>
            <p className="text-[13px] text-muted-foreground/40 mt-1">{t("teams.subtitle")}</p>
          </div>
          <Button
            onClick={() => {
              if (memberLimitReached) {
                toast.error(`Limite de ${maxMembers} membros atingido. Faça upgrade do plano para adicionar mais.`);
                return;
              }
              setDialogOpen(true);
            }}
            className="gap-2 h-10 px-5 rounded-xl text-sm font-medium btn-accent"
          >
            <UserPlus className="h-4 w-4" />
            {t("teams.inviteMember") || "Convidar"}
          </Button>
        </motion.div>

        {/* Org Info Bar */}
        {org && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="flex items-center gap-6 px-5 py-3.5 rounded-2xl border border-border/10 bg-card/60"
          >
            {/* Org name */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="h-7 text-sm font-semibold bg-transparent border-border/20 max-w-[180px] px-2"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && saveName()}
                  />
                  <Button size="icon" variant="ghost" onClick={saveName} className="h-6 w-6">
                    <Check className="h-3 w-3 text-primary" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingName(false)} className="h-6 w-6">
                    <XIcon className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="group flex items-center gap-1.5 cursor-pointer" onClick={canManage ? startEditName : undefined}>
                  <span className="text-sm font-semibold text-foreground truncate">{org.name}</span>
                  {canManage && (
                    <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors" />
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-8 w-px bg-border/10" />

            {/* Plan */}
            <div className="text-center px-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">Plano</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{plan?.name || "—"}</p>
              {org.subscription_status === "trial" && org.current_period_end && (
                (() => {
                  const daysLeft = Math.max(0, Math.ceil((new Date(org.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                  return (
                    <p className={`text-[10px] font-medium mt-0.5 ${daysLeft <= 1 ? "text-destructive" : "text-amber-500"}`}>
                      {daysLeft > 0 ? `${daysLeft} dia${daysLeft !== 1 ? "s" : ""} restante${daysLeft !== 1 ? "s" : ""}` : "Teste expirado"}
                    </p>
                  );
                })()
              )}
            </div>

            {/* Divider */}
            <div className="h-8 w-px bg-border/10" />

            {/* Credits */}
            <div className="text-center px-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">Créditos</p>
              <p className="text-sm font-semibold text-foreground mt-0.5 flex items-center justify-center gap-1">
                <Coins className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.5} />
                {orgCredits?.toLocaleString("pt-BR") ?? "—"}
              </p>
            </div>

            {/* Divider */}
            <div className="h-8 w-px bg-border/10" />

            {/* Members count */}
            <div className="text-center px-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">Membros</p>
              <p className={`text-sm font-semibold mt-0.5 ${memberLimitReached ? "text-destructive" : "text-foreground"}`}>
                {members.length}/{maxMembers}
              </p>
            </div>
          </motion.div>
        )}

        {/* Team Table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
        <Card className="border border-border/10 bg-card rounded-2xl shadow-none overflow-hidden">
          <CardContent className="p-0">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div className="flex gap-1 bg-muted/30 p-0.5 rounded-xl w-fit">
                {[
                  { key: "todos", label: t("teams.filterAll") },
                  { key: "gerente", label: t("teams.roleAdmin") },
                  { key: "atendente", label: t("teams.roleUser") },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveRoleTab(tab.key); setCurrentPage(1); }}
                    className={`px-4 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-200 ${
                      activeRoleTab === tab.key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_140px_100px_36px] gap-3 px-5 py-2 border-b border-border/8">
              <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/40">Membro</span>
              <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/40">Papel</span>
              <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/40">Status</span>
              <span />
            </div>

            {isLoading ? (
              <div className="p-5 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-11 rounded-lg bg-muted/10 animate-pulse" />
                ))}
              </div>
            ) : paginated.length === 0 ? (
              <div className="py-14 text-center">
                <UsersRound className="h-7 w-7 text-muted-foreground/20 mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground/50">{t("teams.noMembers") || "Nenhum membro encontrado"}</p>
              </div>
            ) : (
              paginated.map((m, i) => {
                const status = getStatus(m);
                const isMe = m.id === user?.id;
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03, duration: 0.25 }}
                    className="grid grid-cols-[1fr_140px_100px_36px] gap-3 items-center px-5 py-3 border-b border-border/6 last:border-b-0 hover:bg-muted/5 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[9px] bg-muted/30 text-muted-foreground">{getInitials(m.display_name || m.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-[13px] truncate text-foreground leading-tight">
                          {m.display_name || m.email}
                          {isMe && <span className="text-[10px] text-muted-foreground/30 ml-1">(você)</span>}
                        </p>
                        {m.display_name && <p className="text-[11px] text-muted-foreground/30 truncate leading-tight">{m.email}</p>}
                      </div>
                    </div>
                    <span className="text-[12px] text-muted-foreground">{roleLabels[m.role ?? "user"]}</span>
                    <span className={`text-[12px] font-medium ${status.color}`}>{status.label}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/20 hover:text-foreground">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover z-50 min-w-[150px]">
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="text-xs gap-2">
                            <Shield className="h-3.5 w-3.5" />
                            Alterar papel
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-popover z-50">
                            {ROLES.map((r) => (
                              <DropdownMenuItem
                                key={r}
                                onClick={() => updateRole.mutate({ userId: m.id, newRole: r })}
                                className={`text-xs ${m.role === r ? "font-bold text-primary" : ""}`}
                              >
                                {roleLabels[r]}
                                {m.role === r && <span className="ml-auto text-[10px] text-muted-foreground">atual</span>}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleCopyInviteLink(m)} className="text-xs gap-2">
                          <Link2 className="h-3.5 w-3.5" />
                          Copiar link
                        </DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setPasswordMember(m); setNewMemberPassword(""); setShowMemberPassword(false); }} className="text-xs gap-2">
                              <KeyRound className="h-3.5 w-3.5" />
                              Alterar senha
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setMemberToRemove(m)} className="text-xs gap-2 text-destructive focus:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                );
              })
            )}

            {totalPages > 1 && (
              <div className="flex justify-center gap-1 py-3">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`h-7 w-7 rounded-lg text-[11px] font-medium transition-colors ${
                      page === currentPage ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/20"
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </motion.div>

        {/* Permissions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
        <Card className="border border-border/10 bg-card rounded-2xl shadow-none overflow-hidden">
          <CardContent className="p-5">
            <h3 className="text-[13px] font-semibold text-foreground mb-4">Permissões por papel</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/8 bg-muted/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
                  <span className="text-[12px] font-semibold text-foreground">Admin</span>
                  <span className="text-[10px] text-muted-foreground/40 ml-auto">Acesso completo</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { icon: LayoutDashboard, label: "Dashboard" },
                    { icon: MessageSquare, label: "Chat" },
                    { icon: Bot, label: "Agentes" },
                    { icon: Contact, label: "Contatos" },
                    { icon: Kanban, label: "CRM" },
                    { icon: ListTodo, label: "Tarefas" },
                    { icon: UsersRound, label: "Equipe" },
                    { icon: Plug, label: "Canais" },
                    { icon: BarChart3, label: "Relatórios" },
                    { icon: Headset, label: "Atendimentos" },
                    { icon: Settings, label: "Configurações" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5 py-0.5">
                      <Check className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                      <span className="text-[11px] text-foreground/60">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border/8 bg-muted/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-[12px] font-semibold text-foreground">Usuário</span>
                  <span className="text-[10px] text-muted-foreground/40 ml-auto">Acesso limitado</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { label: "Dashboard", allowed: true },
                    { label: "Chat", allowed: true },
                    { label: "Agentes", allowed: false },
                    { label: "Contatos", allowed: true },
                    { label: "CRM", allowed: true },
                    { label: "Tarefas", allowed: true },
                    { label: "Equipe", allowed: false },
                    { label: "Canais", allowed: false },
                    { label: "Relatórios", allowed: false },
                    { label: "Atendimentos", allowed: false },
                    { label: "Configurações", allowed: true },
                  ].map((item) => (
                    <div key={item.label} className={`flex items-center gap-1.5 py-0.5 ${!item.allowed ? "opacity-30" : ""}`}>
                      {item.allowed
                        ? <Check className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                        : <XIcon className="h-2.5 w-2.5 text-destructive shrink-0" />
                      }
                      <span className="text-[11px] text-foreground/60">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>

        {/* Invite Team Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("teams.inviteMember") || "Convidar membro"}</DialogTitle>
              <DialogDescription>{t("teams.inviteDescription") || "Adicione um novo membro à equipe"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("teams.fullName")} className="pl-9 h-9 text-sm" />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("teams.emailPlaceholder")} type="email" className="pl-9 h-9 text-sm" />
              </div>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30">
                {ROLES.map((r) => (<option key={r} value={r}>{roleLabels[r]}</option>))}
              </select>
              <Button onClick={handleCreate} size="sm" disabled={createUser.isPending || !name.trim() || !email.trim()} className="gap-1.5 w-full">
                <UserPlus className="h-3.5 w-3.5" />
                {createUser.isPending ? t("teams.creating") : t("teams.createUser")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Remove Team Member */}
        <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Remover membro
              </AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover <span className="font-medium text-foreground">{memberToRemove?.email}</span> da equipe?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (memberToRemove) { removeMember.mutate(memberToRemove.id); setMemberToRemove(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {removeMember.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Remove Org Member */}
        <AlertDialog open={!!removingOrgMember} onOpenChange={(open) => !open && setRemovingOrgMember(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover membro</AlertDialogTitle>
              <AlertDialogDescription>Tem certeza que deseja remover este membro da organização?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (removingOrgMember) removeOrgMember.mutate(removingOrgMember); setRemovingOrgMember(null); }}>
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Invite Org Member Dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Convidar membro</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground/60">Nome</label>
                <Input placeholder="Nome do membro" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground/60">Email</label>
                <Input type="email" placeholder="email@exemplo.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground/60">Papel</label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Membro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground/40">Se o usuário não possui conta, receberá um convite por email.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setInviteOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleInvite} disabled={inviting} className="gap-1.5">
                {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                Enviar convite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog open={!!passwordMember} onOpenChange={(open) => { if (!open) { setPasswordMember(null); setNewMemberPassword(""); setShowMemberPassword(false); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                Alterar senha
              </DialogTitle>
              <DialogDescription>
                Alterar senha de <span className="font-medium text-foreground">{passwordMember?.display_name || passwordMember?.email}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="relative">
                <input
                  type={showMemberPassword ? "text" : "password"}
                  value={newMemberPassword}
                  onChange={(e) => setNewMemberPassword(e.target.value)}
                  placeholder="Nova senha"
                  className="w-full h-10 px-3 pr-10 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowMemberPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  {showMemberPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setPasswordMember(null)}>Cancelar</Button>
              <Button size="sm" onClick={handleChangePassword} disabled={changingPassword || !newMemberPassword} className="gap-1.5">
                {changingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Alterar senha
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
