import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, PieChart, Bot,
  Filter, Calendar as CalendarIcon, LayoutGrid, Headset,
  ChevronDown, AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/PageTransition";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useAgents } from "@/hooks/useAgents";
import { useOrgUserIds } from "@/hooks/useOrgUserIds";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Cell, PieChart as RPieChart, Pie, Tooltip as RTooltip, Legend,
} from "recharts";
import { KpiCard, EmptyState, RankingCard } from "@/components/dashboard/DashboardShared";
import SupportTab from "@/components/dashboard/SupportTab";
import SalesFunnelCard from "@/components/dashboard/SalesFunnelCard";
import { TopContactsCard } from "@/components/dashboard/TopContactsCard";
import { TopAgentsCard } from "@/components/dashboard/TopAgentsCard";
import { customIcons } from "@/assets/custom-icons";
import { ThemedIcon } from "@/components/ui/themed-icon";
import type { DateRange } from "react-day-picker";

/* ─── Custom Tooltip ─── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-foreground text-background px-4 py-2.5 rounded-xl shadow-xl text-[12px] font-medium">
      <p className="text-background/60 text-[11px] mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="tabular-nums">
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Custom Donut Label ─── */
function renderDonutLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.05) return null;
  return (
    <text x={x} y={y} fill="hsl(var(--muted-foreground))" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11} fontWeight={500}>
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

// ─── Overview Tab Content ──────────────────────
function OverviewTab({ dateRange, filterField, filterValue }: { dateRange: { from: Date; to: Date }; filterField: string | null; filterValue: string | null }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { data: agents } = useAgents();
  const { data: orgUserIds, isLoading: orgLoading } = useOrgUserIds();
  const uids = orgUserIds ?? [];
  const orgReady = !orgLoading && uids.length > 0;

  const { data: transactions } = useQuery({
    queryKey: ["credit_transactions_dashboard", uids, dateRange.from, dateRange.to, filterField, filterValue],
    queryFn: async () => {
      let query = (supabase as any)
        .from("credit_transactions")
        .select("*")
        .in("user_id", uids)
        .gte("created_at", startOfDay(dateRange.from).toISOString())
        .lte("created_at", endOfDay(dateRange.to).toISOString())
        .order("created_at", { ascending: true });
      if (filterField === "agent" && filterValue) {
        query = query.eq("agent_id", filterValue);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: orgReady,
  });

  const { data: conversations } = useQuery({
    queryKey: ["conversations_dashboard", uids, dateRange.from, dateRange.to, filterField, filterValue],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select("id, contact_name, created_at, agent_id, is_ai_active, last_message_at, profile_picture_url, assigned_to, remote_jid, user_id")
        .in("user_id", uids)
        .or(`created_at.gte.${startOfDay(dateRange.from).toISOString()},last_message_at.gte.${startOfDay(dateRange.from).toISOString()}`)
        .lte("created_at", endOfDay(dateRange.to).toISOString());
      if (filterField === "agent" && filterValue) {
        query = query.eq("agent_id", filterValue);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: orgReady,
  });

  // Fetch messages in date range for rankings
  const { data: messagesInRange } = useQuery({
    queryKey: ["messages_dashboard_rankings", uids, dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("conversation_id, sender")
        .in("user_id", uids)
        .gte("timestamp", startOfDay(dateRange.from).toISOString())
        .lte("timestamp", endOfDay(dateRange.to).toISOString());
      return data || [];
    },
    enabled: orgReady,
  });

  // Fetch org members for top atendentes
  const { data: orgMembers } = useQuery({
    queryKey: ["org_members_dashboard", user?.id],
    queryFn: async () => {
      const { data: orgData } = await supabase.rpc("get_user_org_id", { _user_id: user!.id });
      if (!orgData) return [];
      const { data } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgData);
      if (!data?.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", data.map(m => m.user_id));
      return profiles || [];
    },
    enabled: !!user,
  });

  const { data: newLeads } = useQuery({
    queryKey: ["new_leads_dashboard", uids, dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, created_at")
        .in("user_id", uids)
        .gte("created_at", startOfDay(dateRange.from).toISOString())
        .lte("created_at", endOfDay(dateRange.to).toISOString());
      return data || [];
    },
    enabled: orgReady,
  });

  const creditsSpent = useMemo(() => {
    if (!transactions) return 0;
    return transactions
      .filter(t => t.type === "debit" || t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }, [transactions]);

  const completedConversations = conversations?.length ?? 0;
  const newContactsCount = newLeads?.length ?? 0;

  // ─── 7-day sparkline data ───
  const spark7Days = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      return format(d, "yyyy-MM-dd");
    });
    const creditsPerDay = days.map(() => 0);
    const convosPerDay = days.map(() => 0);
    const leadsPerDay = days.map(() => 0);

    transactions?.forEach(t => {
      if (t.type === "debit" || t.amount < 0) {
        const d = format(new Date(t.created_at), "yyyy-MM-dd");
        const idx = days.indexOf(d);
        if (idx >= 0) creditsPerDay[idx] += Math.abs(t.amount);
      }
    });
    conversations?.forEach(c => {
      const d = format(new Date(c.created_at), "yyyy-MM-dd");
      const idx = days.indexOf(d);
      if (idx >= 0) convosPerDay[idx]++;
    });
    newLeads?.forEach(l => {
      const d = format(new Date(l.created_at), "yyyy-MM-dd");
      const idx = days.indexOf(d);
      if (idx >= 0) leadsPerDay[idx]++;
    });

    return { credits: creditsPerDay, convos: convosPerDay, leads: leadsPerDay };
  }, [transactions, conversations, newLeads]);

  const creditsByDay = useMemo(() => {
    if (!transactions?.length) return [];
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      if (t.type === "debit" || t.amount < 0) {
        const day = format(new Date(t.created_at), "dd/MM");
        map[day] = (map[day] || 0) + Math.abs(t.amount);
      }
    });
    return Object.entries(map).map(([day, value]) => ({ day, value }));
  }, [transactions]);

  const creditsByModel = useMemo(() => {
    if (!transactions?.length) return [];
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      if (t.type === "debit" || t.amount < 0) {
        const model = (t as any).model_id || "Outros";
        map[model] = (map[model] || 0) + Math.abs(t.amount);
      }
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const MODEL_COLORS = [
    "hsl(217, 97%, 39%)",
    "hsl(162, 55%, 38%)",
    "hsl(36, 88%, 48%)",
    "hsl(275, 55%, 52%)",
    "hsl(4, 76%, 50%)",
    "hsl(225, 10%, 75%)",
  ];

  // Top Agentes: by messages the agent handled + credits + model
  const topAgents = useMemo(() => {
    if (!messagesInRange?.length || !conversations?.length || !agents?.length) return [];
    const convAgentMap: Record<string, string | null> = {};
    conversations.forEach((c) => { convAgentMap[c.id] = c.agent_id; });
    const map: Record<string, number> = {};
    messagesInRange.forEach((m) => {
      if (m.sender === "agent") {
        const agentId = convAgentMap[m.conversation_id];
        if (agentId) map[agentId] = (map[agentId] || 0) + 1;
      }
    });
    // Credits per agent from transactions
    const agentCredits: Record<string, number> = {};
    transactions?.forEach((t) => {
      if ((t.type === "debit" || t.amount < 0) && t.agent_id) {
        agentCredits[t.agent_id] = (agentCredits[t.agent_id] || 0) + Math.abs(t.amount);
      }
    });
    // Channels used by each agent
    const agentChannels: Record<string, Set<string>> = {};
    conversations.forEach((c) => {
      if (c.agent_id) {
        if (!agentChannels[c.agent_id]) agentChannels[c.agent_id] = new Set();
        const jid = c.remote_jid || "";
        if (jid.includes("@s.whatsapp.net") || jid.includes("@g.us")) agentChannels[c.agent_id].add("whatsapp");
        else if (jid.startsWith("tg_")) agentChannels[c.agent_id].add("telegram");
        else if (jid.startsWith("widget_")) agentChannels[c.agent_id].add("widget");
      }
    });
    return Object.entries(map)
      .map(([id, count]) => {
        const agent = agents.find(a => a.id === id);
        return {
          name: agent?.name || t("agents.noAgentFound") || "Agent",
          metric: count.toString(),
          metricLabel: t("dashboard.messages") || "Messages",
          avatarUrl: agent?.avatar_url || null,
          credits: agentCredits[id] || 0,
          model: agent?.model || null,
          channels: Array.from(agentChannels[id] || []),
        };
      })
      .sort((a, b) => parseInt(b.metric) - parseInt(a.metric))
      .slice(0, 5);
  }, [messagesInRange, conversations, agents, transactions]);

  // Top Atendentes: by human messages sent (sender="human")
  const topAtendentes = useMemo(() => {
    if (!messagesInRange?.length || !conversations?.length) return [];
    // Map conversation_id -> attendant (assigned_to or user_id as fallback)
    const convAttendantMap: Record<string, string> = {};
    conversations.forEach((c) => {
      convAttendantMap[c.id] = c.assigned_to || (c as any).user_id || user?.id || "";
    });
    // Count human messages per attendant
    const attendantMsgCount: Record<string, number> = {};
    messagesInRange.forEach((m) => {
      if (m.sender === "human") {
        const attendantId = convAttendantMap[m.conversation_id];
        if (attendantId) {
          attendantMsgCount[attendantId] = (attendantMsgCount[attendantId] || 0) + 1;
        }
      }
    });
    return Object.entries(attendantMsgCount)
      .map(([userId, count]) => {
        const profile = orgMembers?.find(p => p.user_id === userId);
        return {
          name: profile?.display_name || t("dashboard.attendant") || "Attendant",
          metric: count.toString(),
          metricLabel: t("dashboard.messages") || "Messages",
          avatarUrl: profile?.avatar_url || null,
        };
      })
      .sort((a, b) => parseInt(b.metric) - parseInt(a.metric))
      .slice(0, 5);
  }, [messagesInRange, conversations, orgMembers, user]);

  // Top Contatos: by messages received from contact (sender="user")
  const topContacts = useMemo(() => {
    if (!messagesInRange?.length || !conversations?.length) return [];
    const convNameMap: Record<string, string> = {};
    const convAvatarMap: Record<string, string | null> = {};
    const convChannelMap: Record<string, string> = {};
    const convModelMap: Record<string, string | null> = {};
    conversations.forEach((c) => {
      convNameMap[c.id] = c.contact_name || t("contacts.unknown") || "Unknown";
      convAvatarMap[c.id] = c.profile_picture_url || null;
      // Determine channel from remote_jid
      const jid = c.remote_jid || "";
      if (jid.includes("@s.whatsapp.net") || jid.includes("@g.us")) convChannelMap[c.id] = "whatsapp";
      else if (jid.startsWith("tg_")) convChannelMap[c.id] = "telegram";
      else if (jid.startsWith("widget_")) convChannelMap[c.id] = "widget";
      else convChannelMap[c.id] = "other";
      // Get model from agent
      const agent = agents?.find(a => a.id === c.agent_id);
      convModelMap[c.id] = agent?.model || null;
    });

    // Count credits per conversation from transactions
    const convCreditsMap: Record<string, number> = {};
    transactions?.forEach((t) => {
      if ((t.type === "debit" || t.amount < 0) && t.agent_id) {
        // Match agent to conversations
        conversations.forEach((c) => {
          if (c.agent_id === t.agent_id) {
            convCreditsMap[c.id] = (convCreditsMap[c.id] || 0) + Math.abs(t.amount);
          }
        });
      }
    });

    const map: Record<string, { count: number; avatarUrl: string | null; channel: string; credits: number; model: string | null }> = {};
    messagesInRange.forEach((m) => {
      if (m.sender === "user") {
        const name = convNameMap[m.conversation_id] || t("contacts.unknown") || "Unknown";
        if (!map[name]) map[name] = {
          count: 0,
          avatarUrl: convAvatarMap[m.conversation_id] || null,
          channel: convChannelMap[m.conversation_id] || "other",
          credits: convCreditsMap[m.conversation_id] || 0,
          model: convModelMap[m.conversation_id] || null,
        };
        map[name].count += 1;
      }
    });
    return Object.entries(map)
      .map(([name, { count, avatarUrl, channel, credits, model }]) => ({
        name,
        metric: count.toString(),
        metricLabel: t("dashboard.interactions") ? t("dashboard.interactions").replace(":", "") : "Interactions",
        avatarUrl,
        channel,
        credits,
        model,
      }))
      .sort((a, b) => parseInt(b.metric) - parseInt(a.metric))
      .slice(0, 5);
  }, [messagesInRange, conversations, agents, transactions]);

  return (
    <div className="space-y-7">
      {/* KPI Cards */}
      <motion.div
        className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <KpiCard
          iconSrc={customIcons.iconChecklist}
          iconAlt="Atendimentos"
          title={t("dashboard.completedConversations") || "Atendimentos Concluídos"}
          subtitle={t("dashboard.completedConversationsSub") || "Atendimentos finalizados no período"}
          value={completedConversations}
          change={0}
          sparkData={spark7Days.convos}
          accentColor="hsl(217, 97%, 39%)"
        />
        <KpiCard
          iconSrc={customIcons.iconCard}
          iconAlt="Créditos"
          title={t("dashboard.creditsSpent") || "Créditos Gastos"}
          subtitle={t("dashboard.creditsSpentSub") || "Créditos consumidos em IA no período"}
          value={creditsSpent}
          change={0}
          sparkData={spark7Days.credits}
          accentColor="hsl(36, 88%, 48%)"
        />
        <KpiCard
          iconSrc={customIcons.iconUser}
          iconAlt="Contatos"
          title={t("dashboard.newContacts") || "Novos Contatos"}
          subtitle={t("dashboard.newContactsSub") || "Novos contatos captados no período"}
          value={newContactsCount}
          change={0}
          sparkData={spark7Days.leads}
          accentColor="hsl(162, 55%, 38%)"
        />
        <KpiCard
          iconSrc={customIcons.iconCalendar}
          iconAlt="Agendamentos"
          title={t("dashboard.totalSchedules") || "Total de Agendamentos"}
          subtitle={t("dashboard.totalSchedulesSub") || "Agendamentos realizados no período"}
          value={0}
          change={0}
          accentColor="hsl(275, 55%, 52%)"
        />
      </motion.div>

      {/* Charts Row — Sophisticated */}
      <motion.div
        className="grid gap-5 grid-cols-1 lg:grid-cols-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.5 }}
      >
        {/* Area Chart — Credits over time */}
        <Card className="relative border border-border/15 bg-card rounded-3xl shadow-none lg:col-span-3 overflow-hidden stat-card">
          <CardContent className="relative p-7 sm:p-8">
            <div
              className="pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full blur-3xl opacity-30"
              style={{ background: "hsl(var(--accent) / 0.22)" }}
            />
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="icon-container icon-container-sm">
                  <ThemedIcon src={customIcons.iconSignpost} alt="Evolução" className="h-[18px] w-[18px] opacity-95" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-foreground">
                    {t("dashboard.creditsByPeriod") || "Créditos por Período"}
                  </p>
                  <p className="text-[11px] text-muted-foreground/85 mt-0.5">
                    {t("dashboard.creditsByPeriodSub")}
                  </p>
                </div>
              </div>
              {creditsByDay.length > 0 && (
                <div className="text-right">
                  <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{creditsSpent}</p>
                  <p className="text-[11px] text-muted-foreground/82">{t("dashboard.totalInPeriod")}</p>
                </div>
              )}
            </div>
            {creditsByDay.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={creditsByDay}>
                    <defs>
                      <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.38)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground) / 0.75)" }}
                      axisLine={false}
                      tickLine={false}
                      dy={8}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground) / 0.75)" }}
                      axisLine={false}
                      tickLine={false}
                      dx={-4}
                    />
                    <RTooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--accent))"
                      strokeWidth={2.5}
                      fill="url(#creditGradient)"
                      name={t("dashboard.credits") || "Credits"}
                      dot={false}
                      activeDot={{ r: 5, fill: "hsl(var(--accent))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                      isAnimationActive={true}
                      animationDuration={1200}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={BarChart3} title={t("dashboard.noData")} subtitle={t("dashboard.noDataCredits")} />
            )}
          </CardContent>
        </Card>

        {/* Donut Chart — Credits by model */}
        <Card className="relative border border-border/15 bg-card rounded-3xl shadow-none lg:col-span-2 overflow-hidden stat-card">
          <CardContent className="relative p-7 sm:p-8">
            <div
              className="pointer-events-none absolute -bottom-20 -left-16 h-44 w-44 rounded-full blur-3xl opacity-20"
              style={{ background: "hsl(var(--accent) / 0.22)" }}
            />
            <div className="flex items-center gap-4 mb-7">
              <div className="icon-container icon-container-sm">
                <ThemedIcon src={customIcons.iconChartPie} alt="Modelos" className="h-[18px] w-[18px] opacity-95" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">{t("dashboard.creditsByModel")}</p>
                <p className="text-[11px] text-muted-foreground/85 mt-0.5">{t("dashboard.creditsByModelSub")}</p>
              </div>
            </div>
            {creditsByModel.length > 0 ? (
              <div className="space-y-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <RPieChart>
                      <Pie
                        data={creditsByModel}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                        isAnimationActive={true}
                        animationDuration={1000}
                        animationEasing="ease-out"
                        animationBegin={200}
                        label={renderDonutLabel}
                      >
                        {creditsByModel.map((_, i) => (
                          <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                        ))}
                      </Pie>
                      <RTooltip content={<ChartTooltip />} />
                    </RPieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-2.5 justify-center pt-2">
                  {creditsByModel.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-border/15 bg-muted/10 px-2.5 py-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                      <span className="text-[11px] text-muted-foreground/90">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon={PieChart} title={t("dashboard.noData")} subtitle={t("dashboard.noDataCredits")} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Sales Funnel */}
      <SalesFunnelCard dateRange={dateRange} />

      {/* Rankings Row */}
      <motion.div
        className="grid gap-5 grid-cols-1 md:grid-cols-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.5 }}
      >
        <TopAgentsCard items={topAgents} title={t("dashboard.topAgents")} subtitle={t("dashboard.messagesAnswered")} />
        <RankingCard
          iconSrc={customIcons.iconPhone}
          iconAlt="Atendentes"
          title={t("dashboard.topAiAgents")}
          subtitle={t("dashboard.messagesSent")}
          items={topAtendentes}
        />
        <TopContactsCard items={topContacts} title={t("dashboard.topContacts")} subtitle={t("dashboard.messagesReceived")} />
      </motion.div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────
export default function Dashboard() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("geral");
  const { data: orgData } = useOrganization();
  const org = orgData?.org;

  // Onboarding wizard (lazy import)
  const [OnboardingWizard, setOW] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    if (!localStorage.getItem("hosana-onboarding-done")) {
      import("@/components/OnboardingWizard").then((m) => setOW(() => m.OnboardingWizard));
    }
  }, []);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterField, setFilterField] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState<string | null>(null);
  const { data: agents } = useAgents();

  const effectiveRange = {
    from: dateRange.from ?? subDays(new Date(), 30),
    to: dateRange.to ?? new Date(),
  };

  const dateLabel = `${format(effectiveRange.from, "dd/MM/yy")} - ${format(effectiveRange.to, "dd/MM/yy")}`;
  const activeFilterText = filterField
    ? `${filterField === "agent" ? t("dashboard.originAgent") : t("dashboard.attendant")}: ${filterValue ? (agents?.find((a) => a.id === filterValue)?.name || filterValue) : t("dashboard.all")}`
    : null;

  const handlePreset = (days: number) => {
    setDateRange({ from: subDays(new Date(), days), to: new Date() });
    setCalendarOpen(false);
  };

  return (
    <PageTransition>
      <div className="space-y-10">
        {/* Past due banner */}
        {(org?.subscription_status === "past_due" || org?.subscription_status === "cancelled") && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border px-6 py-4 flex items-center justify-between gap-4"
            style={{
              borderColor: org.subscription_status === "past_due"
                ? 'hsl(38 92% 50% / 0.4)'
                : 'hsl(0 84% 60% / 0.4)',
              background: org.subscription_status === "past_due"
                ? 'linear-gradient(135deg, hsl(38 92% 50% / 0.08) 0%, hsl(38 92% 50% / 0.02) 100%)'
                : 'linear-gradient(135deg, hsl(0 84% 60% / 0.08) 0%, hsl(0 84% 60% / 0.02) 100%)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: org.subscription_status === "past_due"
                    ? 'hsl(38 92% 50% / 0.15)'
                    : 'hsl(0 84% 60% / 0.15)',
                }}
              >
                <AlertTriangle
                  className="h-5 w-5"
                  style={{
                    color: org.subscription_status === "past_due"
                      ? 'hsl(38 92% 50%)'
                      : 'hsl(0 84% 60%)',
                  }}
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground/90">
                  {org.subscription_status === "past_due"
                    ? "Pagamento pendente"
                    : "Assinatura cancelada"}
                </p>
                <p className="text-[12px] text-muted-foreground/50 mt-0.5">
                  {org.subscription_status === "past_due"
                    ? "Sua fatura está atrasada. Regularize para manter o acesso completo aos recursos."
                    : "Sua assinatura foi cancelada. Contrate um plano para voltar a usar todos os recursos."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0 gap-2 text-[12px]"
              onClick={() => window.location.href = "/billing"}
              style={{
                background: org.subscription_status === "past_due"
                  ? 'hsl(38 92% 50%)'
                  : 'hsl(0 84% 60%)',
                color: 'white',
              }}
            >
              {org.subscription_status === "past_due" ? "Regularizar pagamento" : "Ver planos"}
            </Button>
          </motion.div>
        )}

        {/* Header */}
        <motion.div
          className="relative overflow-hidden rounded-3xl border border-border/15 bg-card p-5 sm:p-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="pointer-events-none absolute -top-28 -right-28 h-64 w-64 rounded-full blur-3xl opacity-20 bg-[hsl(var(--accent))]" />
          <div className="pointer-events-none absolute -bottom-28 -left-28 h-56 w-56 rounded-full blur-3xl opacity-10 bg-[hsl(var(--accent))]" />

          <div className="relative flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="pt-1">
                <span className="inline-flex items-center rounded-full border border-border/20 bg-muted/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                  Dashboard Executivo
                </span>
                <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground mt-2">{t("dashboard.title")}</h1>
                <p className="text-[13px] text-muted-foreground/95 mt-1.5">
                  {t("dashboard.subtitle") || "Informações em tempo real sobre sua conta e agentes"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-xl border border-border/20 bg-muted/10 px-3 py-1.5 text-[11px] text-muted-foreground/90">
                  {dateLabel}
                </span>
                {activeFilterText && (
                  <span className="inline-flex items-center rounded-xl border border-border/20 bg-muted/10 px-3 py-1.5 text-[11px] text-muted-foreground/90">
                    {activeFilterText}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Tab Pills */}
              <div className="flex gap-1 bg-muted/20 p-1 rounded-2xl border border-border/15">
                <button
                  onClick={() => setActiveTab("geral")}
                  className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-xl transition-all duration-200 ${
                    activeTab === "geral"
                      ? "bg-background text-foreground shadow-sm border border-border/20"
                      : "text-muted-foreground/85 hover:text-foreground hover:bg-muted/20"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">{t("dashboard.tabOverview") || "Visão Geral"}</span>
                  <span className="xs:hidden">{t("dashboard.tabOverview") || "Geral"}</span>
                </button>
                <button
                  onClick={() => setActiveTab("atendimento")}
                  className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-xl transition-all duration-200 ${
                    activeTab === "atendimento"
                      ? "bg-background text-foreground shadow-sm border border-border/20"
                      : "text-muted-foreground/85 hover:text-foreground hover:bg-muted/20"
                  }`}
                >
                  <Headset className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">{t("dashboard.tabSupport") || "Atendimento"}</span>
                  <span className="xs:hidden">{t("dashboard.tabSupport") || "Atend."}</span>
                </button>
              </div>

              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 gap-1.5 text-xs rounded-2xl border-border/20 bg-background/70 hover:bg-muted/15",
                      filterField && "border-foreground/25 text-foreground bg-muted/10",
                    )}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{filterField ? (filterField === "agent" ? t("dashboard.originAgent") : t("dashboard.attendant")) : t("dashboard.filter")}</span>
                    {filterField && (
                      <span
                        className="ml-1 cursor-pointer hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setFilterField(null); setFilterValue(null); }}
                      >
                        ✕
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0 bg-popover z-50 rounded-2xl border-border/15" align="end">
                  {!filterField ? (
                    <div className="p-2">
                       <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground/60 px-3 py-2">{t("dashboard.filterByField")}</p>
                       <button
                         className="w-full text-left px-3 py-2.5 text-[13px] rounded-xl hover:bg-muted/15 flex items-center gap-2.5 transition-colors"
                         onClick={() => setFilterField("agent")}
                       >
                         <Bot className="h-3.5 w-3.5 text-muted-foreground/60" />
                         {t("dashboard.originAgent")}
                       </button>
                       <button
                         className="w-full text-left px-3 py-2.5 text-[13px] rounded-xl hover:bg-muted/15 flex items-center gap-2.5 transition-colors"
                         onClick={() => setFilterField("attendant")}
                       >
                         <Headset className="h-3.5 w-3.5 text-muted-foreground/60" />
                         {t("dashboard.attendant")}
                       </button>
                    </div>
                  ) : (
                    <div className="p-2">
                      <div className="flex items-center gap-2 px-3 py-2">
                         <button className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors" onClick={() => { setFilterField(null); setFilterValue(null); }}>
                           {t("dashboard.back")}
                         </button>
                         <p className="text-xs font-medium text-muted-foreground/50">
                           {filterField === "agent" ? t("dashboard.originAgent") : t("dashboard.attendant")}
                         </p>
                      </div>
                      <button
                        className={cn("w-full text-left px-3 py-2.5 text-[13px] rounded-xl hover:bg-muted/15 transition-colors", !filterValue && "bg-muted/15")}
                        onClick={() => { setFilterValue(null); setFilterOpen(false); }}
                       >
                         {t("dashboard.all")}
                       </button>
                      {filterField === "agent" && agents?.map((agent) => (
                        <button
                          key={agent.id}
                          className={cn("w-full text-left px-3 py-2.5 text-[13px] rounded-xl hover:bg-muted/15 truncate transition-colors", filterValue === agent.id && "bg-muted/15")}
                          onClick={() => { setFilterValue(agent.id); setFilterOpen(false); }}
                        >
                          {agent.name}
                        </button>
                      ))}
                      {filterField === "attendant" && (
                        <p className="px-3 py-4 text-xs text-muted-foreground/30 text-center">{t("dashboard.noAttendants")}</p>
                      )}
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs rounded-2xl border-border/20 bg-background/70 hover:bg-muted/15">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{dateLabel}</span>
                    <span className="sm:hidden">{format(effectiveRange.from, "dd/MM")} - {format(effectiveRange.to, "dd/MM")}</span>
                    <ChevronDown className="h-3 w-3 opacity-40" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl border-border/15" align="end">
                  <div className="flex gap-1 p-2 border-b border-border/10">
                    {[
                      { label: "7d", days: 7 },
                      { label: "15d", days: 15 },
                      { label: "30d", days: 30 },
                      { label: "90d", days: 90 },
                    ].map((p) => (
                      <Button key={p.days} variant="ghost" size="sm" className="text-xs h-7 rounded-xl" onClick={() => handlePreset(p.days)}>
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      if (range) setDateRange(range);
                      if (range?.from && range?.to) setCalendarOpen(false);
                    }}
                    numberOfMonths={1}
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </motion.div>

        {/* Tab Content */}
        {activeTab === "geral" ? (
          <OverviewTab dateRange={effectiveRange} filterField={filterField} filterValue={filterValue} />
        ) : (
          <SupportTab dateRange={effectiveRange} />
        )}
      </div>
      {OnboardingWizard && <OnboardingWizard />}
    </PageTransition>
  );
}
