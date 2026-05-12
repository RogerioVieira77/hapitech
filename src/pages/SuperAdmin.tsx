import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Bot, MessageSquare, Plug, FileText, Shield, Trash2,
  Crown, ChevronRight, RefreshCw, AlertTriangle, Eye, Activity,
  Database, TrendingUp, UserCheck, Search, X, Zap, Building2, Mail,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AiModelsTab } from "@/components/AiModelsTab";
import { SmtpSettingsTab } from "@/components/SmtpSettingsTab";

import { PlansTab } from "@/components/PlansTab";

import { OrganizationsTab } from "@/components/OrganizationsTab";

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: "super_admin" | "admin" | "user" | null;
  org_name: string | null;
}

interface AdminStats {
  total_users: number;
  total_agents: number;
  total_conversations: number;
  total_messages: number;
  active_connections: number;
  total_knowledge_files: number;
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-border/15 bg-card/60 backdrop-blur-xl p-5"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-5`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-medium mb-1.5">{label}</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            {value !== undefined ? value.toLocaleString("pt-BR") : "—"}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${color} bg-opacity-10 shrink-0`}>
          <Icon className="h-5 w-5 text-foreground/70" strokeWidth={1.5} />
        </div>
      </div>
    </motion.div>
  );
}

function getInitials(name: string | null, email: string) {
  if (name) return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return email.charAt(0).toUpperCase();
}

function RoleBadge({ role, t }: { role: AdminUser["role"]; t: (k: string) => string }) {
  if (role === "super_admin") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20">
      <Crown className="h-2.5 w-2.5" /> Super Admin
    </span>
  );
  if (role === "admin") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <Shield className="h-2.5 w-2.5" /> Admin
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary/50 text-muted-foreground border border-border/20">
      <UserCheck className="h-2.5 w-2.5" /> {t("superadmin.statUsers")}
    </span>
  );
}

export default function SuperAdmin() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "ai-models" | "plans" | "organizations" | "email">("overview");
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("has_role" as any, { _user_id: user.id, _role: "super_admin" })
      .then(({ data }) => {
        setIsSuperAdmin(!!data);
        if (!data) setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadData();
  }, [isSuperAdmin]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        supabase.rpc("get_admin_stats" as any),
        supabase.rpc("get_all_users_for_admin" as any),
      ]);
      if (statsRes.data) setStats(statsRes.data as AdminStats);
      if (usersRes.data) setUsers(usersRes.data as AdminUser[]);
    } catch (err) {
      toast.error(t("superadmin.errorLoading"));
    } finally {
      setLoading(false);
    }
  };

  const promoteToSuperAdmin = async (targetUserId: string) => {
    setProcessingId(targetUserId);
    try {
      const { error } = await supabase
        .from("user_roles" as any)
        .insert({ user_id: targetUserId, role: "super_admin" });
      if (error) throw error;
      toast.success(t("superadmin.promotedSuperAdmin"));
      await loadData();
    } catch {
      toast.error(t("superadmin.errorPromoting"));
    } finally {
      setProcessingId(null);
    }
  };

  const promoteToAdmin = async (targetUserId: string) => {
    setProcessingId(targetUserId);
    try {
      const { error } = await supabase
        .from("user_roles" as any)
        .insert({ user_id: targetUserId, role: "admin" });
      if (error) throw error;
      toast.success(t("superadmin.promotedAdmin"));
      await loadData();
    } catch {
      toast.error(t("superadmin.errorPromoting"));
    } finally {
      setProcessingId(null);
    }
  };

  const removeRole = async (targetUserId: string) => {
    if (targetUserId === user?.id) {
      toast.error(t("superadmin.cannotRemoveOwnRole"));
      return;
    }
    setProcessingId(targetUserId);
    try {
      const { error } = await supabase
        .from("user_roles" as any)
        .delete()
        .eq("user_id", targetUserId);
      if (error) throw error;
      toast.success(t("superadmin.roleRemoved"));
      await loadData();
    } catch {
      toast.error(t("superadmin.errorRemoving"));
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = users.filter(u =>
    (u.email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (u.display_name?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  if (isSuperAdmin === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-7 w-7 text-destructive/70" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{t("superadmin.accessDenied")}</h2>
        <p className="text-sm text-muted-foreground/60">{t("superadmin.noPermission")}</p>
        <button
          onClick={() => navigate("/")}
          className="mt-2 text-sm text-primary hover:underline"
        >
          {t("superadmin.backToHome")}
        </button>
      </div>
    );
  }

  if (loading || isSuperAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 border-b border-border/10 bg-background/80 backdrop-blur-xl">
        <div className="w-full px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Crown className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">{t("superadmin.title")}</h1>
              <p className="text-[11px] text-muted-foreground/50">{t("superadmin.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-secondary/40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("superadmin.refresh")}
          </button>
        </div>

        <div className="w-full px-6 flex gap-1 pb-0 overflow-x-auto">
          {[
            { id: "overview", label: t("superadmin.overview"), icon: Activity },
            { id: "users", label: t("superadmin.users"), icon: Users },
            { id: "organizations", label: "Organizações", icon: Building2 },
            { id: "plans", label: "Planos", icon: Crown },
            
            
            { id: "ai-models", label: t("superadmin.aiModels"), icon: Zap },
            { id: "email", label: "E-mail", icon: Mail },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground/50 hover:text-foreground/70"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-sm font-semibold text-foreground/80 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary/60" strokeWidth={1.5} />
                  {t("superadmin.systemMetrics")}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <StatCard icon={Users} label={t("superadmin.statUsers")} value={stats?.total_users} color="from-blue-500 to-blue-600" />
                  <StatCard icon={Bot} label={t("superadmin.statAgents")} value={stats?.total_agents} color="from-purple-500 to-purple-600" />
                  <StatCard icon={MessageSquare} label={t("superadmin.statConversations")} value={stats?.total_conversations} color="from-green-500 to-green-600" />
                  <StatCard icon={Activity} label={t("superadmin.statMessages")} value={stats?.total_messages} color="from-orange-500 to-orange-600" />
                  <StatCard icon={Plug} label={t("superadmin.statConnections")} value={stats?.active_connections} color="from-emerald-500 to-emerald-600" />
                  <StatCard icon={FileText} label={t("superadmin.statFiles")} value={stats?.total_knowledge_files} color="from-pink-500 to-pink-600" />
                </div>
              </div>

              <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl p-6">
                <h3 className="text-sm font-semibold text-foreground/80 mb-4 flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary/60" strokeWidth={1.5} />
                  {t("superadmin.dbInfo")}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: t("superadmin.dbProject"), value: "jxnadbeodkozvgmzuvnm" },
                    { label: t("superadmin.dbRegion"), value: "sa-east-1" },
                    { label: t("superadmin.dbTables"), value: `11 ${t("superadmin.tables")}` },
                    { label: t("superadmin.dbStorage"), value: "chat-media, avatars, knowledge" },
                  ].map(item => (
                    <div key={item.label} className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40">{item.label}</p>
                      <p className="text-xs font-mono text-foreground/70 truncate">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border/10 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary/60" strokeWidth={1.5} />
                    {t("superadmin.recentUsers")}
                  </h3>
                  <button
                    onClick={() => setActiveTab("users")}
                    className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
                  >
                    {t("superadmin.viewAll")} <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="divide-y divide-border/8">
                  {users.slice(0, 5).map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-6 py-3">
                      <div className="h-8 w-8 rounded-full bg-secondary/60 border border-border/20 flex items-center justify-center text-[11px] font-semibold text-foreground/60 shrink-0">
                        {getInitials(u.display_name, u.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground/80 truncate">{u.display_name || u.email.split("@")[0]}</p>
                        <p className="text-[11px] text-muted-foreground/40 truncate">{u.email}</p>
                      </div>
                      <RoleBadge role={u.role} t={t} />
                      <span className="text-[10px] text-muted-foreground/30 hidden md:block">
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "users" && (
            <motion.div
              key="users"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                  <Input
                    placeholder={t("superadmin.searchUser")}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 bg-secondary/20 border-border/15 h-9 text-[13px] rounded-xl"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground/40 shrink-0">
                  {filteredUsers.length} {filteredUsers.length !== 1 ? t("superadmin.users").toLowerCase() : t("superadmin.user").toLowerCase()}
                </span>
              </div>

              <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-6 py-3 border-b border-border/10 bg-secondary/10">
                  {[t("superadmin.user"), t("superadmin.role"), t("superadmin.registration"), t("superadmin.actions")].map(h => (
                    <span key={h} className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium">{h}</span>
                  ))}
                </div>

                <div className="divide-y divide-border/8">
                  <AnimatePresence>
                    {filteredUsers.map(u => (
                      <motion.div
                        key={u.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-6 py-4 hover:bg-secondary/10 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-secondary/60 border border-border/20 flex items-center justify-center text-[11px] font-bold text-foreground/60 shrink-0">
                            {getInitials(u.display_name, u.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-foreground/80 truncate">
                              {u.display_name || u.email.split("@")[0]}
                              {u.id === user?.id && (
                                <span className="ml-1.5 text-[10px] text-primary/60">{t("superadmin.you")}</span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground/40 truncate">{u.email}</p>
                            {u.org_name && (
                              <p className="text-[10px] text-muted-foreground/30 truncate flex items-center gap-1 mt-0.5">
                                <Building2 className="h-2.5 w-2.5" />
                                {u.org_name}
                              </p>
                            )}
                          </div>
                        </div>

                        <RoleBadge role={u.role} t={t} />

                        <span className="text-[11px] text-muted-foreground/40 tabular-nums whitespace-nowrap">
                          {new Date(u.created_at).toLocaleDateString("pt-BR")}
                        </span>

                        <div className="flex items-center gap-1">
                          {processingId === u.id ? (
                            <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                          ) : u.id === user?.id ? (
                            <span className="text-[10px] text-muted-foreground/30 px-2">{t("superadmin.you")}</span>
                          ) : (
                            <>
                              {(u.role === null || u.role === "user") && (
                                <button
                                  onClick={() => promoteToAdmin(u.id)}
                                  title={t("superadmin.promoteAdmin")}
                                  className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/15 transition-colors"
                                >
                                  <Shield className="h-3 w-3" />
                                  Admin
                                </button>
                              )}


                              {u.role && (
                                <button
                                  onClick={() => removeRole(u.id)}
                                  title={t("superadmin.removeRole")}
                                  className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive/70 hover:bg-destructive/20 border border-destructive/15 transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {filteredUsers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Users className="h-8 w-8 text-muted-foreground/20" strokeWidth={1.5} />
                      <p className="text-sm text-muted-foreground/40">{t("superadmin.noUsersFound")}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "organizations" && (
            <motion.div
              key="organizations"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <OrganizationsTab users={users} />
            </motion.div>
          )}

          {activeTab === "plans" && (
            <motion.div
              key="plans"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <PlansTab />
            </motion.div>
          )}


          {activeTab === "ai-models" && (
            <motion.div
              key="ai-models"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AiModelsTab />
            </motion.div>
          )}

          {activeTab === "email" && (
            <motion.div
              key="email"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <SmtpSettingsTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
