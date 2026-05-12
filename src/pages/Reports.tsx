import { useState, useMemo } from "react";
import { useOrgUserIds } from "@/hooks/useOrgUserIds";
import { motion } from "framer-motion";
import { Search, Download, Link2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PageTransition } from "@/components/PageTransition";

const COLORS = ["hsl(235, 72%, 55%)", "hsl(162, 55%, 38%)", "hsl(36, 88%, 48%)", "hsl(275, 55%, 52%)", "hsl(4, 76%, 50%)", "hsl(225, 10%, 75%)"];
const ease = [0.25, 0.46, 0.45, 0.94] as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-foreground text-background px-4 py-2.5 rounded-xl shadow-xl text-[12px] font-medium">
      <p className="text-background/60 text-[11px] mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="tabular-nums">{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  );
}

function formatDateInput(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function parseInputDate(s: string): Date | null {
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

export default function Reports() {
  const { user } = useAuth();
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), 1);

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFromStr, setDateFromStr] = useState(formatDateInput(defaultFrom));
  const [dateToStr, setDateToStr] = useState(formatDateInput(defaultTo));
  const [appliedFrom, setAppliedFrom] = useState(defaultFrom);
  const [appliedTo, setAppliedTo] = useState(defaultTo);
  const [originOpen, setOriginOpen] = useState(true);

  const { data: orgUserIds, isLoading: orgLoading } = useOrgUserIds();
  const uids = orgUserIds ?? [];
  const orgReady = !orgLoading && uids.length > 0;

  const { data: leads } = useQuery({
    queryKey: ["reports-leads", uids, appliedFrom.toISOString(), appliedTo.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, phone, source, created_at, value")
        .in("user_id", uids)
        .gte("created_at", appliedFrom.toISOString())
        .lte("created_at", appliedTo.toISOString())
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!user && orgReady,
  });

  const handleSearch = () => {
    const from = parseInputDate(dateFromStr);
    const to = parseInputDate(dateToStr);
    if (from) setAppliedFrom(from);
    if (to) setAppliedTo(to);
  };

  const handleClear = () => {
    setSearchTerm("");
    setDateFromStr(formatDateInput(defaultFrom));
    setDateToStr(formatDateInput(defaultTo));
    setAppliedFrom(defaultFrom);
    setAppliedTo(defaultTo);
  };

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    if (!searchTerm.trim()) return leads;
    const q = searchTerm.toLowerCase();
    return leads.filter(l =>
      (l.source || "").toLowerCase().includes(q) ||
      l.name.toLowerCase().includes(q) ||
      (l.phone || "").includes(q)
    );
  }, [leads, searchTerm]);

  const sourceData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const src = l.source || "Manual";
      map[src] = (map[src] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredLeads]);

  const timelineData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const sources = new Set<string>();
    filteredLeads.forEach(l => {
      const d = new Date(l.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const src = l.source || "Manual";
      sources.add(src);
      if (!map[d]) map[d] = {};
      map[d][src] = (map[d][src] || 0) + 1;
    });
    return {
      data: Object.entries(map).map(([date, srcMap]) => ({ date, ...srcMap })),
      sources: Array.from(sources),
    };
  }, [filteredLeads]);

  const dateRangeLabel = `${appliedFrom.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })} até ${appliedTo.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`;

  return (
    <PageTransition>
      <div className="space-y-10 w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="page-header"
        >
          <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">Conversões</h1>
          <p className="text-[13px] text-muted-foreground/40 mt-1.5">Relatórios de leads e conversões</p>
        </motion.div>

        {/* Filter bar */}
        <motion.div
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-5 rounded-3xl bg-card border border-border/15"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease }}
        >
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30" />
            <Input
              placeholder="Origem, nome do lead ou número de telefone"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 h-10 bg-muted/15 border-border/15 rounded-xl text-[13px]"
            />
          </div>
          <Input
            value={dateFromStr}
            onChange={e => setDateFromStr(e.target.value)}
            className="w-36 h-10 bg-muted/15 border-border/15 rounded-xl text-[13px] text-center"
            placeholder="dd/mm/aaaa"
          />
          <Input
            value={dateToStr}
            onChange={e => setDateToStr(e.target.value)}
            className="w-36 h-10 bg-muted/15 border-border/15 rounded-xl text-[13px] text-center"
            placeholder="dd/mm/aaaa"
          />
          <Button onClick={handleSearch} className="h-10 px-5 rounded-2xl text-[13px] font-medium btn-accent">
            Buscar
          </Button>
          <Button onClick={handleClear} variant="outline" className="h-10 px-5 rounded-2xl border-border/15 text-foreground hover:bg-muted/20 text-[13px] font-medium shadow-none">
            Limpar filtros
          </Button>
        </motion.div>

        {/* Origem Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease }}
        >
          <Collapsible open={originOpen} onOpenChange={setOriginOpen}>
            <Card className="border border-border/15 bg-card rounded-3xl shadow-none overflow-hidden">
              <CollapsibleTrigger className="w-full flex items-center justify-between px-7 py-5 hover:bg-muted/10 transition-colors">
                <h2 className="text-[15px] font-semibold text-foreground">Origem</h2>
                <ChevronDown className={`h-5 w-5 text-muted-foreground/40 transition-transform ${originOpen ? "" : "-rotate-90"}`} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="px-7 pb-7 pt-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Source cards */}
                  <div className="space-y-2">
                    {sourceData.length === 0 ? (
                      <div className="py-8 text-center text-[13px] text-muted-foreground/30">Nenhum dado no período</div>
                    ) : (
                      sourceData.map((src, i) => (
                        <div key={src.name} className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/10 border border-border/10">
                          <div className="h-10 w-10 rounded-xl bg-muted/30 flex items-center justify-center">
                            <Link2 className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-foreground">{src.name}</p>
                            <p className="text-[12px] text-muted-foreground/40">{src.value} leads</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Pie chart */}
                  <div className="flex flex-col items-center">
                    <p className="text-[13px] font-semibold text-foreground mb-4">Distribuição por origem</p>
                    {sourceData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={sourceData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" strokeWidth={0}>
                            {sourceData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-[13px] text-muted-foreground/30">Sem dados</div>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 justify-center">
                      {sourceData.map((src, i) => (
                        <div key={src.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {src.name}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bar chart */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[13px] font-semibold text-foreground">{dateRangeLabel}</p>
                      <button className="text-muted-foreground/30 hover:text-foreground transition-colors p-1">
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                    {timelineData.data.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={timelineData.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.35)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.35)" }} allowDecimals={false} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTooltip />} />
                          {timelineData.sources.map((src, i) => (
                            <Bar key={src} dataKey={src} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === timelineData.sources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-[13px] text-muted-foreground/30">Sem dados</div>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2">
                      {timelineData.sources.map((src, i) => (
                        <div key={src} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {src}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </motion.div>
      </div>
    </PageTransition>
  );
}
