import { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { format, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { customIcons } from "@/assets/custom-icons";
import { ThemedIcon } from "@/components/ui/themed-icon";

interface SalesFunnelCardProps {
  dateRange: { from: Date; to: Date };
}

export default function SalesFunnelCard({ dateRange }: SalesFunnelCardProps) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const { data: stages } = useQuery({
    queryKey: ["crm_stages_funnel", user?.id],
    queryFn: async () => {
      const { data: pipelines } = await supabase
        .from("crm_pipelines")
        .select("id")
        .order("position", { ascending: true })
        .limit(1);
      if (!pipelines?.length) return [];
      const { data } = await supabase
        .from("crm_stages")
        .select("*")
        .eq("pipeline_id", pipelines[0].id)
        .order("position", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: leads } = useQuery({
    queryKey: ["leads_funnel", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const funnelData = useMemo(() => {
    if (!stages?.length || !leads?.length) return [];
    const totalLeads = leads.length;
    return stages.map((stage) => {
      const count = leads.filter((l) => l.stage === stage.slug).length;
      const pct = totalLeads > 0 ? ((count / totalLeads) * 100).toFixed(1) : "0";
      return { name: stage.name, slug: stage.slug, count, pct, position: stage.position };
    });
  }, [stages, leads]);

  const stats = useMemo(() => {
    if (!leads?.length) return { leadTime: "—", lastCreated: "—", avgTicket: "R$ 0" };

    const times = leads
      .filter((l) => l.updated_at !== l.created_at)
      .map((l) => differenceInMinutes(new Date(l.updated_at), new Date(l.created_at)));
    const avgMinutes = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    let leadTime = "—";
    if (avgMinutes > 0) {
      if (avgMinutes < 60) leadTime = `${avgMinutes} min`;
      else if (avgMinutes < 1440) leadTime = `${Math.round(avgMinutes / 60)}h`;
      else leadTime = `${Math.round(avgMinutes / 1440)}d`;
    }

    const lastCreated = format(new Date(leads[0].created_at), "dd MMM HH:mm", { locale: ptBR });

    const withValue = leads.filter((l) => (l.value ?? 0) > 0);
    const avg = withValue.length > 0
      ? withValue.reduce((s, l) => s + (l.value ?? 0), 0) / withValue.length
      : 0;
    const avgTicket = avg > 0
      ? `R$ ${avg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "R$ 0,00";

    return { leadTime, lastCreated, avgTicket };
  }, [leads]);

  const maxCount = useMemo(() => Math.max(...(funnelData.map((d) => d.count) || [1]), 1), [funnelData]);

  if (!funnelData.length) return null;

  const stageColors = [
    "hsl(160, 60%, 45%)",
    "hsl(165, 55%, 48%)",
    "hsl(170, 50%, 50%)",
    "hsl(178, 50%, 48%)",
    "hsl(185, 55%, 45%)",
    "hsl(190, 60%, 42%)",
    "hsl(195, 65%, 40%)",
    "hsl(200, 70%, 38%)",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.5 }}
    >
      <Card className="border border-border/10 bg-card rounded-3xl shadow-none overflow-hidden stat-card">
        <CardContent className="p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="icon-container icon-container-sm">
              <ThemedIcon src={customIcons.iconSignpost} alt="Funil" className="h-[18px] w-[18px] opacity-95" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">{t("dashboard.salesFunnel")}</p>
              <p className="text-[11px] text-muted-foreground/85 mt-0.5">{t("dashboard.salesFunnelDesc")}</p>
            </div>
          </div>

          {/* Funnel Stages Header */}
          <div className="grid gap-0 mb-2" style={{ gridTemplateColumns: `repeat(${funnelData.length}, 1fr)` }}>
            {funnelData.map((stage, i) => (
              <div key={stage.slug} className="px-3 py-2 border-r border-border/10 last:border-r-0">
                <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{stage.count}</p>
                <p className="text-[11px] font-medium mt-0.5" style={{ color: stageColors[i % stageColors.length] }}>
                  {stage.name}
                </p>
                {i > 0 && (
                  <p className="text-[10px] text-muted-foreground/78 mt-0.5 tabular-nums">{stage.pct}%</p>
                )}
              </div>
            ))}
          </div>

          {/* Funnel Visual */}
          <div className="relative h-48 mt-4 mb-6 overflow-hidden rounded-2xl bg-muted/10">
            <svg width="100%" height="100%" viewBox="0 0 1000 200" preserveAspectRatio="none" className="absolute inset-0">
              <defs>
                <linearGradient id="funnelGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(160, 60%, 50%)" stopOpacity={0.9} />
                  <stop offset="50%" stopColor="hsl(175, 55%, 48%)" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(195, 65%, 45%)" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              {(() => {
                const totalStages = funnelData.length;
                if (totalStages === 0) return null;
                const segWidth = 1000 / totalStages;
                const points: string[] = [];
                funnelData.forEach((stage, i) => {
                  const ratio = maxCount > 0 ? stage.count / maxCount : 0;
                  const height = Math.max(ratio * 80, 5);
                  const x = i * segWidth;
                  const y = 100 - height;
                  points.push(`${x},${y}`);
                });
                const lastRatio = maxCount > 0 ? funnelData[totalStages - 1].count / maxCount : 0;
                const lastHeight = Math.max(lastRatio * 80, 5);
                points.push(`1000,${100 - lastHeight}`);
                points.push(`1000,${100 + lastHeight}`);
                for (let i = totalStages - 1; i >= 0; i--) {
                  const ratio = maxCount > 0 ? funnelData[i].count / maxCount : 0;
                  const height = Math.max(ratio * 80, 5);
                  const x = i * segWidth;
                  const y = 100 + height;
                  points.push(`${x},${y}`);
                }
                return <polygon points={points.join(" ")} fill="url(#funnelGrad)" className="transition-all duration-700" />;
              })()}
              {funnelData.slice(1).map((_, i) => {
                const x = ((i + 1) / funnelData.length) * 1000;
                return <line key={i} x1={x} y1={0} x2={x} y2={200} stroke="hsl(var(--border) / 0.15)" strokeWidth={1} />;
              })}
            </svg>
          </div>

          {/* Bottom Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="stat-card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <ThemedIcon src={customIcons.iconChecklist} alt="" className="h-3.5 w-3.5 opacity-85" />
                <span className="text-[11px] text-muted-foreground/82">{t("dashboard.leadTime")}</span>
              </div>
              <p className="text-lg font-bold tracking-tight text-foreground">{stats.leadTime}</p>
            </div>
            <div className="stat-card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <ThemedIcon src={customIcons.iconCalendarNote} alt="" className="h-3.5 w-3.5 opacity-85" />
                <span className="text-[11px] text-muted-foreground/82">{t("dashboard.lastLeadCreated")}</span>
              </div>
              <p className="text-lg font-bold tracking-tight text-foreground">{stats.lastCreated}</p>
            </div>
            <div className="stat-card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <ThemedIcon src={customIcons.iconCard} alt="" className="h-3.5 w-3.5 opacity-85" />
                <span className="text-[11px] text-muted-foreground/82">{t("dashboard.avgTicket")}</span>
              </div>
              <p className="text-lg font-bold tracking-tight text-foreground">{stats.avgTicket}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
