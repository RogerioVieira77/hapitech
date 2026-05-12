import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Hash,
  MessageCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useOrgUserIds } from "@/hooks/useOrgUserIds";
import { startOfDay, endOfDay } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import { DetailedKpiCard, EmptyState, StatCard } from "./DashboardShared";
import { customIcons } from "@/assets/custom-icons";
import { ThemedIcon } from "@/components/ui/themed-icon";

interface SupportTabProps {
  dateRange: { from: Date; to: Date };
}

export default function SupportTab({ dateRange }: SupportTabProps) {
  const { t } = useLanguage();
  const { data: orgUserIds, isLoading: orgLoading } = useOrgUserIds();
  const uids = orgUserIds ?? [];
  const orgReady = !orgLoading && uids.length > 0;

  // Conversations in period
  const { data: conversations } = useQuery({
    queryKey: ["support_conversations", uids, dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, contact_name, created_at, agent_id, is_ai_active")
        .in("user_id", uids)
        .gte("created_at", startOfDay(dateRange.from).toISOString())
        .lte("created_at", endOfDay(dateRange.to).toISOString());
      return data || [];
    },
    enabled: orgReady,
  });

  // Credit transactions
  const { data: transactions } = useQuery({
    queryKey: ["support_transactions", uids, dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_transactions")
        .select("*")
        .in("user_id", uids)
        .gte("created_at", startOfDay(dateRange.from).toISOString())
        .lte("created_at", endOfDay(dateRange.to).toISOString())
        .order("created_at", { ascending: true });
      return (data || []) as any[];
    },
    enabled: orgReady,
  });

  // Messages in period
  const { data: messages } = useQuery({
    queryKey: ["support_messages", uids, dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, created_at, sender")
        .in("user_id", uids)
        .gte("created_at", startOfDay(dateRange.from).toISOString())
        .lte("created_at", endOfDay(dateRange.to).toISOString());
      return data || [];
    },
    enabled: orgReady,
  });

  const totalConversations = conversations?.length ?? 0;

  // Credits stats
  const creditsStats = useMemo(() => {
    if (!transactions?.length) return { total: 0, avgPerConvo: 0, minConvo: "—", maxConvo: "—" };
    const debits = transactions.filter(t => t.type === "debit" || t.amount < 0);
    const total = debits.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const avgPerConvo = totalConversations > 0 ? Math.round(total / totalConversations) : 0;

    // Group by agent_id (as proxy for conversation grouping)
    const byAgent: Record<string, number> = {};
    debits.forEach(t => {
      const key = t.agent_id || "none";
      byAgent[key] = (byAgent[key] || 0) + Math.abs(t.amount);
    });
    const vals = Object.values(byAgent);
    const minVal = vals.length ? Math.min(...vals) : 0;
    const maxVal = vals.length ? Math.max(...vals) : 0;

    return { total, avgPerConvo, minConvo: minVal.toString(), maxConvo: maxVal.toString() };
  }, [transactions, totalConversations]);

  // Interactions stats
  const interactionsStats = useMemo(() => {
    if (!messages?.length) return { avg: 0, min: 0, max: 0 };
    const byConvo: Record<string, number> = {};
    messages.forEach(m => {
      byConvo[m.conversation_id] = (byConvo[m.conversation_id] || 0) + 1;
    });
    const counts = Object.values(byConvo);
    return {
      avg: counts.length ? (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1) : "0",
      min: counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
    };
  }, [messages]);

  // Cost stats
  const costStats = useMemo(() => {
    if (!transactions?.length) return { total: "R$ 0,00", mostExpensive: "R$ 0,00", cheapest: "R$ 0,00" };
    // Simplified: 1 credit = R$ 0.01
    const debits = transactions.filter(t => t.type === "debit" || t.amount < 0);
    const total = debits.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const fmt = (v: number) => `R$ ${(v * 0.01).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    return { total: fmt(total), mostExpensive: fmt(total), cheapest: fmt(0) };
  }, [transactions]);

  // Timeline: credits consumed per hour of day
  const timelineData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, "0")}:00`,
      credits: 0,
      atendimentos: 0,
    }));
    if (transactions?.length) {
      transactions.forEach(t => {
        if (t.type === "debit" || t.amount < 0) {
          const h = new Date(t.created_at).getHours();
          hours[h].credits += Math.abs(t.amount);
        }
      });
    }
    if (messages?.length) {
      const convHours: Record<string, Set<number>> = {};
      messages.forEach(m => {
        const h = new Date(m.created_at).getHours();
        if (!convHours[m.conversation_id]) convHours[m.conversation_id] = new Set();
        convHours[m.conversation_id].add(h);
      });
      Object.values(convHours).forEach(hourSet => {
        hourSet.forEach(h => {
          hours[h].atendimentos += 1;
        });
      });
    }
    return hours;
  }, [transactions, messages]);

  // Peak hours
  const peakHours = useMemo(() => {
    const sorted = [...timelineData].sort((a, b) => b.credits - a.credits);
    return sorted.slice(0, 3);
  }, [timelineData]);

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <motion.div
        className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <DetailedKpiCard
          iconSrc={customIcons.iconPhone}
          iconAlt="Atendimento"
          title={t("support.totalConversations")}
          subtitle={t("support.totalConversationsSub")}
          value={totalConversations}
          rows={[
            { label: t("support.completed"), value: totalConversations },
            { label: t("support.inProgress"), value: 0 },
            { label: t("support.waitingHuman"), value: 0 },
          ]}
        />
        <DetailedKpiCard
          iconSrc={customIcons.iconCard}
          iconAlt="Créditos"
          title={t("support.avgCredits")}
          subtitle={t("support.avgCreditsSub")}
          value={creditsStats.avgPerConvo}
          rows={[
            { label: t("support.totalSpent"), value: creditsStats.total },
            { label: t("support.leastCredits"), value: creditsStats.minConvo },
            { label: t("support.mostCredits"), value: creditsStats.maxConvo },
          ]}
        />
        <DetailedKpiCard
          iconSrc={customIcons.iconMessage}
          iconAlt="Mensagens"
          title={t("support.avgInteractions")}
          subtitle={t("support.avgInteractionsSub")}
          value={interactionsStats.avg}
          rows={[
            { label: t("support.minInteractions"), value: interactionsStats.min },
            { label: t("support.maxInteractions"), value: interactionsStats.max },
          ]}
        />
        <DetailedKpiCard
          iconSrc={customIcons.iconChartPie}
          iconAlt="Custo"
          title={t("support.avgCost")}
          subtitle={t("support.avgCostSub")}
          value={costStats.total}
          rows={[
            { label: t("support.totalSpent"), value: costStats.total },
            { label: t("support.mostExpensive"), value: costStats.mostExpensive },
            { label: t("support.cheapest"), value: costStats.cheapest },
          ]}
        />
      </motion.div>

      {/* Timeline + Credits by Channel + Top Channels */}
      <motion.div
        className="grid gap-5 grid-cols-1 lg:grid-cols-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        {/* Timeline de Consumo */}
        <Card className="border border-border/20 bg-muted/15 rounded-3xl shadow-none lg:col-span-2 overflow-hidden">
          <CardContent className="p-7">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="p-2.5 rounded-2xl bg-muted/40">
                <ThemedIcon src={customIcons.iconCalendar} alt="" className="h-4 w-4 opacity-90" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">{t("support.consumptionTimeline")}</p>
                <p className="text-[11px] text-muted-foreground/84 mt-0.5">{t("support.consumptionTimelineSub")}</p>
              </div>
            </div>

            {/* Peak hours */}
            <div className="flex gap-2.5 mb-6">
              {peakHours.map((ph, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-2xl p-3.5 text-center transition-all ${
                    i === 0 ? "bg-foreground/[0.06] border border-foreground/10" : "bg-muted/30"
                  }`}
                >
                  <p className="text-[10px] text-muted-foreground/78 mb-1">
                    {i === 0 ? t("support.peak") : `${i + 1}º`}
                  </p>
                  <p className={`text-lg font-bold ${i === 0 ? "text-foreground" : "text-foreground/70"}`}>
                    {ph.hour}
                  </p>
                  <p className="text-[10px] text-muted-foreground/82">{ph.credits} créditos</p>
                </div>
              ))}
            </div>

            {/* Timeline chart — Area */}
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="timelineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(220, 14%, 18%)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(220, 14%, 18%)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="timelineGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(220, 10%, 55%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(220, 10%, 55%)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground) / 0.62)" }} interval={2} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground) / 0.62)" }} axisLine={false} tickLine={false} />
                  <RTooltip
                    contentStyle={{
                      background: "hsl(var(--foreground))",
                      color: "hsl(var(--background))",
                      border: "none",
                      borderRadius: 12,
                      fontSize: 11,
                      padding: "8px 14px",
                    }}
                  />
                  <Area type="monotone" dataKey="credits" stroke="hsl(220, 14%, 18%)" strokeWidth={2} fill="url(#timelineGrad)" name={t("support.creditsLabel")} dot={false} isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" />
                  <Area type="monotone" dataKey="atendimentos" stroke="hsl(220, 10%, 55%)" strokeWidth={2} fill="url(#timelineGrad2)" name={t("support.conversationsLabel")} dot={false} isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={200} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Créditos por Canal */}
        <Card className="border border-border/20 bg-muted/15 rounded-3xl shadow-none lg:col-span-2 overflow-hidden">
          <CardContent className="p-7">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="p-2.5 rounded-2xl bg-muted/40">
                <ThemedIcon src={customIcons.iconMessageSoft} alt="" className="h-4 w-4 opacity-90" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">{t("support.creditsByChannel")}</p>
                <p className="text-[11px] text-muted-foreground/84 mt-0.5">{t("support.creditsByChannelSub")}</p>
              </div>
            </div>
            <EmptyState
              icon={MessageCircle}
              title={t("dashboard.noData")}
              subtitle={t("dashboard.noDataCredits")}
            />
          </CardContent>
        </Card>

        {/* Top Canais */}
        <Card className="border border-border/20 bg-muted/15 rounded-3xl shadow-none lg:col-span-1 overflow-hidden">
          <CardContent className="p-7">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="p-2.5 rounded-2xl bg-muted/40">
                <ThemedIcon src={customIcons.iconGlobe} alt="" className="h-4 w-4 opacity-90" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">{t("support.topChannels")}</p>
                <p className="text-[11px] text-muted-foreground/84 mt-0.5">{t("support.topChannelsSub")}</p>
              </div>
            </div>
            <EmptyState
              icon={Hash}
              title={t("dashboard.noData")}
              subtitle={t("dashboard.noDataCredits")}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Resolution stats: Equipe Geral / Agente IA / Equipe Humana */}
      <motion.div
        className="grid gap-5 grid-cols-1 md:grid-cols-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <StatCard
          iconSrc={customIcons.iconUser}
          iconAlt="Equipe"
          title={t("support.generalTeam")}
          subtitle={t("support.generalTeamSub")}
          value="0s"
          rows={[
            { label: t("support.avgResolution"), value: "0s" },
            { label: t("support.totalConvos"), value: totalConversations.toString() },
          ]}
        />
        <StatCard
          iconSrc={customIcons.iconDevice}
          iconAlt="Agente IA"
          title={t("support.aiAgent")}
          subtitle={t("support.aiAgentSub")}
          value="0s"
          rows={[
            { label: t("support.aiResolutionRate"), value: "0.0%" },
            { label: t("support.totalConvos"), value: totalConversations.toString() },
          ]}
        />
        <StatCard
          iconSrc={customIcons.iconPhone}
          iconAlt="Equipe humana"
          title={t("support.humanTeam")}
          subtitle={t("support.humanTeamSub")}
          value="0s"
          rows={[
            { label: t("support.transferRate"), value: "0.0%" },
            { label: t("support.totalConvos"), value: "0" },
          ]}
        />
      </motion.div>
    </div>
  );
}
