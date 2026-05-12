import { TrendingUp, TrendingDown, Trophy, Award, Medal } from "lucide-react";
import { motion } from "framer-motion";
import { ThemedIcon } from "@/components/ui/themed-icon";

// ─── Sparkline SVG ─────────────────────────────
function Sparkline({ data, color = "hsl(var(--accent))" }: { data: number[]; color?: string }) {
  if (!data.length || data.every(v => v === 0)) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 140;
  const h = 40;
  const pad = 2;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${w - pad},${h} L${pad},${h} Z`;
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
      <circle cx={points[points.length - 1].split(",")[0]} cy={points[points.length - 1].split(",")[1]} r={3} fill={color} opacity={0.9} />
    </svg>
  );
}

// ─── KPI Card ──────────────────────────────────
export function KpiCard({ icon: Icon, iconSrc, iconAlt, title, subtitle, value, change, sparkData, accentColor, children }: {
  icon?: any; iconSrc?: string; iconAlt?: string; title: string; subtitle: string; value: number | string; change?: number; sparkData?: number[]; accentColor?: string; children?: React.ReactNode;
}) {
  const accent = accentColor || "hsl(var(--accent))";
  return (
    <div className="stat-card card-accent-top group relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full blur-3xl opacity-30"
        style={{ background: `${accent}` }}
      />
      <div className="relative p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0 transition-all"
            style={{
              background: `linear-gradient(145deg, ${accent}12, ${accent}06)`,
              border: `1px solid ${accent}12`,
            }}
          >
            {iconSrc ? (
              <ThemedIcon src={iconSrc} alt={iconAlt ?? ""} className="h-[18px] w-[18px] opacity-95" />
            ) : (
              Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} style={{ color: accent }} /> : null
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">{title}</p>
            <p className="text-[11px] text-muted-foreground/85 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4">
          <p className="text-[2rem] sm:text-[2.15rem] font-extrabold tracking-[-0.04em] text-foreground kpi-value leading-none">{value}</p>
          {sparkData && sparkData.length > 1 && (
            <Sparkline data={sparkData} color={accent} />
          )}
        </div>
        {change !== undefined && (
          <div className="flex items-center gap-1.5 pt-1">
            {change >= 0 ? (
              <TrendingUp className="h-3 w-3 text-success" />
            ) : (
              <TrendingDown className="h-3 w-3 text-destructive" />
            )}
            <span className={`text-[11px] font-semibold ${change >= 0 ? "text-success" : "text-destructive"}`}>
              {change >= 0 ? "+" : ""}{change.toFixed(1)}%
            </span>
            <span className="text-[11px] text-muted-foreground/72">vs período anterior</span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ─── Detailed KPI Card (with sub-rows) ─────────
export function DetailedKpiCard({ icon: Icon, iconSrc, iconAlt, title, subtitle, value, rows, accentColor }: {
  icon?: any; iconSrc?: string; iconAlt?: string; title: string; subtitle: string; value: number | string;
  rows: { label: string; value: string | number }[];
  accentColor?: string;
}) {
  const accent = accentColor || "hsl(var(--accent))";
  return (
    <div className="stat-card card-accent-top relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full blur-3xl opacity-30"
        style={{ background: `${accent}` }}
      />
      <div className="relative p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0"
            style={{
              background: `linear-gradient(145deg, ${accent}12, ${accent}06)`,
              border: `1px solid ${accent}12`,
            }}
          >
            {iconSrc ? (
              <ThemedIcon src={iconSrc} alt={iconAlt ?? ""} className="h-[18px] w-[18px] opacity-95" />
            ) : (
              Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} style={{ color: accent }} /> : null
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">{title}</p>
            <p className="text-[11px] text-muted-foreground/85 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        <p className="text-[2rem] sm:text-[2.15rem] font-extrabold tracking-[-0.04em] text-foreground kpi-value leading-none">{value}</p>
        <div className="space-y-2.5 pt-4 border-t border-border/10">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground/82">{row.label}</span>
              <span className="text-[12px] font-semibold text-foreground tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ───────────────────────────────
export function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex items-center justify-center h-14 w-14 rounded-2xl mb-5"
        style={{
          background: 'linear-gradient(145deg, hsl(var(--muted) / 0.5), hsl(var(--muted) / 0.3))',
          border: '1px solid hsl(var(--border) / 0.15)',
        }}
      >
        <Icon className="h-7 w-7 text-muted-foreground/45" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-muted-foreground/70">{title}</p>
      <p className="text-xs text-muted-foreground/65 mt-1.5 max-w-xs">{subtitle}</p>
    </div>
  );
}

// ─── Ranking Card ──────────────────────────────
export function RankingCard({ icon: Icon, iconSrc, iconAlt, title, subtitle, items, accentColor }: {
  icon?: any; iconSrc?: string; iconAlt?: string; title: string; subtitle: string;
  items: { name: string; metric: string; metricLabel: string; avatarUrl?: string | null }[];
  accentColor?: string;
}) {
  const accent = accentColor || "hsl(var(--accent))";
  const rankColors = ["#f59e0b", "#94a3b8", "#f97316"];

  return (
    <div className="stat-card relative overflow-hidden">
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-28 w-28 rounded-full blur-3xl opacity-25"
        style={{ background: `${accent}` }}
      />
      <div className="relative p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div
              className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0"
              style={{
                background: `linear-gradient(145deg, ${accent}12, ${accent}06)`,
                border: `1px solid ${accent}12`,
              }}
            >
              {iconSrc ? (
                <ThemedIcon src={iconSrc} alt={iconAlt ?? ""} className="h-[18px] w-[18px] opacity-95" />
              ) : (
                Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} style={{ color: accent }} /> : null
              )}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">{title}</p>
              <p className="text-[11px] text-muted-foreground/85 mt-0.5">{subtitle}</p>
            </div>
          </div>
        </div>
        <div>
          {items.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground/60">Nenhum dado</div>
          ) : (
            items.slice(0, 3).map((item, i) => {
              const RankIcon = i === 0 ? Trophy : i === 1 ? Award : Medal;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                  className="flex items-center gap-3.5 py-3.5 border-b border-border/8 last:border-b-0"
                >
                  <span
                    className="text-[11px] w-6 h-6 flex items-center justify-center rounded-lg font-bold tabular-nums"
                    style={{
                      background: `${rankColors[i]}15`,
                      color: rankColors[i],
                    }}
                  >
                    {i + 1}
                  </span>
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 ring-1 ring-border/15" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center shrink-0 ring-1 ring-border/10">
                      <span className="text-[10px] font-bold text-muted-foreground/75">{(item.name || "?").slice(0, 2).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{item.name || "---"}</p>
                    <p className="text-[11px] text-muted-foreground/82">{item.metricLabel}: <span className="font-semibold text-foreground/85">{item.metric}</span></p>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat Row Card (for team resolution stats) ──
export function StatCard({ icon: Icon, iconSrc, iconAlt, title, subtitle, value, rows, accentColor }: {
  icon?: any; iconSrc?: string; iconAlt?: string; title: string; subtitle: string; value: string;
  rows: { label: string; value: string }[];
  accentColor?: string;
}) {
  const accent = accentColor || "hsl(var(--accent))";
  return (
    <div className="stat-card relative overflow-hidden">
      <div
        className="pointer-events-none absolute -bottom-14 -left-12 h-28 w-28 rounded-full blur-3xl opacity-25"
        style={{ background: `${accent}` }}
      />
      <div className="relative p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0"
            style={{
              background: `linear-gradient(145deg, ${accent}12, ${accent}06)`,
              border: `1px solid ${accent}12`,
            }}
          >
            {iconSrc ? (
              <ThemedIcon src={iconSrc} alt={iconAlt ?? ""} className="h-[18px] w-[18px] opacity-95" />
            ) : (
              Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} style={{ color: accent }} /> : null
            )}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            <p className="text-[11px] text-muted-foreground/85 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <p className="text-[2rem] sm:text-[2.15rem] font-extrabold tracking-[-0.04em] text-foreground kpi-value leading-none">{value}</p>
        <div className="space-y-2.5 pt-4 border-t border-border/10">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground/82">{row.label}</span>
              <span className="text-[12px] font-semibold text-foreground tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
