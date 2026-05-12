import { useState, useRef, useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, ArrowRight, ExternalLink, Pencil, Zap, Sparkles, Shield, Building2,
  Crown, Loader2, FileText, Download, Eye, Printer, Receipt, Calendar,
  CreditCard, ChevronDown, Search, Filter, MoreHorizontal, X, RefreshCw,
  CircleCheck, Clock, AlertTriangle,
} from "lucide-react";
import { usePlans, usePlanLimits, Plan } from "@/hooks/usePlan";
import { useOrganization } from "@/hooks/useOrganization";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { BillingDataForm } from "@/components/BillingDataForm";

type Period = "mensal" | "trimestral" | "semestral" | "anual";

const periodKeys: { key: Period; labelKey: string; discount?: string }[] = [
  { key: "mensal", labelKey: "billing.monthly" },
  { key: "trimestral", labelKey: "billing.quarterly", discount: "-5%" },
  { key: "semestral", labelKey: "billing.semiannual", discount: "-7%" },
  { key: "anual", labelKey: "billing.annual", discount: "-10%" },
];

const discountMultiplier: Record<Period, number> = {
  mensal: 1,
  trimestral: 0.95,
  semestral: 0.93,
  anual: 0.9,
};

const planIcons: Record<string, React.ElementType> = {
  basic: Zap,
  standard: Sparkles,
  corporate: Shield,
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function formatBRLShort(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const featureLabelMap: Record<string, string> = {
  widget: "Widget para sites",
  knowledge: "Base de Conhecimento",
  crm: "CRM Completo",
  api: "API completa",
  calendar: "Google Calendar",
  webhooks: "Webhooks",
  mcp: "Integrações MCP",
  voice: "Voz (integração com ElevenLabs)",
};

// Real invoice data from Asaas
interface Invoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  status: "paid" | "pending" | "overdue" | "refunded";
  description: string;
  value: number;
  netValue: number;
  billingType: string;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  transactionReceiptUrl: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  paid: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Pago" },
  pending: { bg: "bg-amber-500/10", text: "text-amber-500", label: "Pendente" },
  overdue: { bg: "bg-red-500/10", text: "text-red-500", label: "Atrasado" },
  refunded: { bg: "bg-muted/20", text: "text-muted-foreground/60", label: "Reembolsado" },
};

/* ---- Invoice Detail View ---- */
function InvoiceDetail({ invoice, orgName, onClose }: { invoice: Invoice; orgName: string; onClose: () => void }) {
  const handleDownloadPdf = () => {
    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Fatura ${invoice.number}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:40px;color:#1a1a1a;max-width:800px;margin:0 auto}
        h1{font-size:22px;margin-bottom:24px}
        table{width:100%;border-collapse:collapse;margin:16px 0}
        th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #eee;font-size:13px}
        th{font-size:11px;text-transform:uppercase;color:#888;font-weight:600}
        .right{text-align:right}
        .totals{margin-top:16px;display:flex;justify-content:flex-end}
        .totals table{width:280px}
        .totals td{border:none;padding:4px 8px}
        .bold{font-weight:700}
        .header{display:flex;justify-content:space-between;margin-bottom:24px}
        .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}
        .paid{background:#d1fae5;color:#059669}
        .pending{background:#fef3c7;color:#d97706}
        .overdue{background:#fee2e2;color:#ef4444}
      </style></head><body>
      <h1>Fatura ${invoice.number}</h1>
      <div class="header">
        <div><strong>${orgName || "Minha Organização"}</strong><br><small>Brasil</small></div>
        <div style="text-align:right">
          <small>Data: ${new Date(invoice.date).toLocaleDateString("pt-BR")}</small><br>
          <small>Vencimento: ${new Date(invoice.dueDate).toLocaleDateString("pt-BR")}</small><br>
          <span class="badge ${invoice.status}">${STATUS_STYLES[invoice.status]?.label || invoice.status}</span>
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Descrição</th><th class="right">Valor</th></tr></thead>
        <tbody><tr><td>1</td><td>${invoice.description}</td><td class="right bold">${formatBRL(invoice.value)}</td></tr></tbody>
      </table>
      <div class="totals"><table>
        <tr class="bold"><td>Total</td><td class="right">${formatBRL(invoice.value)}</td></tr>
        <tr class="bold"><td>Valor Líquido</td><td class="right">${formatBRL(invoice.netValue)}</td></tr>
      </table></div>
      </body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, "_blank");
    if (printWindow) {
      printWindow.onload = () => { printWindow.print(); URL.revokeObjectURL(url); };
    } else {
      const a = document.createElement("a"); a.href = url; a.download = `${invoice.number}.html`; a.click(); URL.revokeObjectURL(url);
    }
  };

  const balanceDue = invoice.status === "paid" ? 0 : invoice.value;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Top bar */}
      <div className="rounded-2xl overflow-hidden border border-primary/20" style={{ background: 'hsl(var(--primary) / 0.06)' }}>
        <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] text-primary/50 uppercase tracking-wider font-medium block">Fatura #</span>
              <span className="text-[16px] font-bold text-foreground">{invoice.number}</span>
            </div>
            <div className="w-px h-8 bg-border/10" />
            <div>
              <span className="text-[10px] text-primary/50 uppercase tracking-wider font-medium block">Data</span>
              <span className="text-[13px] font-medium text-foreground/70">{new Date(invoice.date).toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="w-px h-8 bg-border/10" />
            <div>
              <span className="text-[10px] text-primary/50 uppercase tracking-wider font-medium block">Vencimento</span>
              <span className="text-[13px] font-medium text-foreground/70">{new Date(invoice.dueDate).toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="w-px h-8 bg-border/10" />
            <div>
              <span className="text-[10px] text-primary/50 uppercase tracking-wider font-medium block">Valor</span>
              <span className="text-[16px] font-bold text-foreground">{formatBRL(invoice.value)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[invoice.status]?.bg} ${STATUS_STYLES[invoice.status]?.text}`}>
              {STATUS_STYLES[invoice.status]?.label || invoice.status}
            </span>
            <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-foreground hover:bg-muted/10 transition-all">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-5">
        {/* Invoice document */}
        <div className="flex-1 rounded-2xl border border-border/15 bg-card overflow-hidden">
          <div className="px-8 pt-8 pb-6 border-b border-border/10" style={{ background: 'linear-gradient(180deg, hsl(var(--primary) / 0.03) 0%, transparent 100%)' }}>
            <h2 className="text-[20px] font-bold text-foreground text-center mb-6">Fatura {invoice.number}</h2>
            <div className="flex justify-between">
              <div>
                <p className="text-[13px] font-semibold text-foreground/80">{orgName || "Minha Organização"}</p>
                <p className="text-[11px] text-muted-foreground/40 mt-0.5">Brasil</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground/40">Tipo de pagamento:</p>
                <p className="text-[13px] font-semibold text-foreground/80 mt-0.5">{invoice.billingType || "—"}</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/10">
                  <th className="text-left text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider pb-3 w-8">#</th>
                  <th className="text-left text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider pb-3">Descrição</th>
                  <th className="text-right text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider pb-3 w-24">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/5">
                  <td className="py-4 text-[12px] text-muted-foreground/40">1</td>
                  <td className="py-4">
                    <p className="text-[13px] font-medium text-foreground/80">{invoice.description}</p>
                  </td>
                  <td className="py-4 text-[12px] text-right text-foreground/80 font-semibold tabular-nums">{formatBRL(invoice.value)}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-[13px] font-bold">
                  <span className="text-foreground/70">Total</span>
                  <span className="text-foreground tabular-nums">{formatBRL(invoice.value)}</span>
                </div>
                {invoice.netValue !== invoice.value && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted-foreground/50">Valor Líquido</span>
                    <span className="text-foreground/60 tabular-nums">{formatBRL(invoice.netValue)}</span>
                  </div>
                )}
                <div className="h-px bg-border/15" />
                <div className="flex justify-between text-[13px] font-bold rounded-lg px-3 py-2 -mx-3" style={{ background: 'hsl(var(--primary) / 0.06)' }}>
                  <span className="text-primary">Saldo Devedor</span>
                  <span className="text-primary tabular-nums">{formatBRL(balanceDue)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar actions */}
        <div className="w-[200px] shrink-0 space-y-3">
          <div className="rounded-xl border border-border/15 bg-card p-4 space-y-3">
            <p className="text-[11px] font-bold text-muted-foreground/40 uppercase tracking-wider">Ações</p>
            {invoice.invoiceUrl && (
              <a href={invoice.invoiceUrl} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-medium text-foreground/70 hover:bg-muted/10 transition-colors">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40" /> Ver no Asaas
              </a>
            )}
            <button onClick={handleDownloadPdf} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-medium text-foreground/70 hover:bg-muted/10 transition-colors">
              <Download className="h-3.5 w-3.5 text-muted-foreground/40" /> Download PDF
            </button>
            <button onClick={() => window.print()} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-medium text-foreground/70 hover:bg-muted/10 transition-colors">
              <Printer className="h-3.5 w-3.5 text-muted-foreground/40" /> Imprimir
            </button>
          </div>
          {(invoice.status === "pending" || invoice.status === "overdue") && invoice.invoiceUrl && (
            <a href={invoice.invoiceUrl} target="_blank" rel="noopener noreferrer">
              <Button className="w-full gap-2 text-[12px]" size="sm">
                <CreditCard className="h-3.5 w-3.5" /> Pagar agora
              </Button>
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}
export default function Billing() {
  const [period, setPeriod] = useState<Period>("mensal");
  const [activeTab, setActiveTab] = useState<"plans" | "invoices">("plans");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cpfCnpjDialog, setCpfCnpjDialog] = useState<Plan | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [billingDataOpen, setBillingDataOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [billingData, setBillingData] = useState<any>(null);
  const [billingDataLoading, setBillingDataLoading] = useState(true);
  const { t } = useLanguage();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: orgData } = useOrganization();
  const { plan: currentPlan } = usePlanLimits();

  const org = orgData?.org;
  const multiplier = discountMultiplier[period];

  const fetchBillingData = async () => {
    if (!org?.id) return;
    setBillingDataLoading(true);
    const { data } = await supabase
      .from("billing_data")
      .select("*")
      .eq("organization_id", org.id)
      .maybeSingle();
    setBillingData(data);
    setBillingDataLoading(false);
  };

  useEffect(() => {
    if (org?.id) fetchBillingData();
  }, [org?.id]);

  const handleSyncSubscription = async () => {
    setSyncLoading(true);
    try {
      const res = await supabase.functions.invoke("sync-subscription");
      if (res.error) {
        toast.error(res.error.message || "Erro ao sincronizar");
        return;
      }
      const data = res.data;
      if (data?.synced) {
        toast.success(data.message || "Plano sincronizado!");
        // Reload the page to reflect changes
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.info(data?.message || "Nenhuma alteração encontrada.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setSyncLoading(false);
    }
  };

  const formatCpfCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 11) {
      return digits.replace(/(\d{3})(\d{3})?(\d{3})?(\d{2})?/, (_, a, b, c, d) =>
        [a, b, c].filter(Boolean).join(".") + (d ? `-${d}` : "")
      );
    }
    return digits.replace(/(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{2})?/, (_, a, b, c, d, e) =>
      a + (b ? `.${b}` : "") + (c ? `.${c}` : "") + (d ? `/${d}` : "") + (e ? `-${e}` : "")
    );
  };

  const doCheckout = async (plan: Plan, cpfCnpjValue: string) => {
    const cleanCpf = cpfCnpjValue.replace(/\D/g, "");
    if (cleanCpf.length !== 11 && cleanCpf.length !== 14) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.");
      return;
    }
    setCpfCnpjDialog(null);
    setCheckoutLoading(plan.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error("Você precisa estar logado para contratar um plano.");
        return;
      }

      const res = await supabase.functions.invoke("asaas-checkout", {
        body: { plan_id: plan.id, billing_cycle: period, cpf_cnpj: cleanCpf },
      });

      if (res.error) {
        toast.error(res.error.message || "Erro ao criar checkout");
        return;
      }

      const { payment_url } = res.data;
      if (payment_url) {
        // Save CPF/CNPJ to billing_data for future checkouts
        if (org?.id && cleanCpf) {
          const upsertData = {
            organization_id: org.id,
            document_number: cleanCpf,
            document_type: cleanCpf.length === 11 ? "cpf" : "cnpj",
            legal_name: billingData?.legal_name || org.name || "",
          };
          if (billingData?.id) {
            await supabase.from("billing_data").update({ document_number: cleanCpf, document_type: cleanCpf.length === 11 ? "cpf" : "cnpj" }).eq("id", billingData.id);
          } else {
            await supabase.from("billing_data").insert(upsertData);
          }
          fetchBillingData();
        }
        window.open(payment_url, "_blank");
        toast.success("Redirecionando para o pagamento...");
      } else {
        toast.error("Não foi possível gerar o link de pagamento.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const startCheckout = (plan: Plan) => {
    if (billingData?.document_number) {
      doCheckout(plan, billingData.document_number);
      return;
    }
    setCpfCnpj("");
    setCpfCnpjDialog(plan);
  };

  const handleCheckout = () => {
    if (!cpfCnpjDialog) return;
    doCheckout(cpfCnpjDialog, cpfCnpj);
  };

  const billingLabel = period === "mensal" ? t("billing.billingMonthly") :
    period === "trimestral" ? t("billing.billingQuarterly") :
    period === "semestral" ? t("billing.billingSemiannual") :
    t("billing.billingAnnual");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const fetchInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const res = await supabase.functions.invoke("asaas-invoices");
      if (!res.error && res.data?.invoices) {
        setInvoices(res.data.invoices);
      }
    } catch {
      // silent
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "invoices") fetchInvoices();
  }, [activeTab]);

  const tabs = [
    { key: "plans" as const, label: "Planos", icon: Crown },
    { key: "invoices" as const, label: "Faturas", icon: Receipt },
  ];

  return (
    <PageTransition>
      <div className="space-y-8 w-full">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div className="page-header">
            <h1 className="text-[1.75rem] font-bold tracking-tight">{t("billing.title")}</h1>
            <p className="text-[13px] text-muted-foreground/40 mt-1.5">{t("billing.subtitle")}</p>
          </div>
        </div>

        {/* Current plan banner */}
        {currentPlan && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-primary/20 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--primary) / 0.05) 100%)' }}
          >
            <div className="px-6 py-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20">
                  <Crown className="h-5 w-5 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground/90">{t("billing.currentPlan")}: {currentPlan.name}</p>
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      {org?.billing_period || t("billing.monthly")}
                    </Badge>
                    {(() => {
                      const status = org?.subscription_status;
                      if (status === "active") return (
                        <Badge className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10">
                          <CircleCheck className="h-3 w-3" /> Ativa
                        </Badge>
                      );
                      if (status === "past_due") return (
                        <Badge className="text-[10px] gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/10">
                          <AlertTriangle className="h-3 w-3" /> Atrasada
                        </Badge>
                      );
                      if (status === "cancelled") return (
                        <Badge className="text-[10px] gap-1 bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/10">
                          <X className="h-3 w-3" /> Cancelada
                        </Badge>
                      );
                      return (
                        <Badge className="text-[10px] gap-1 bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/20">
                          <Clock className="h-3 w-3" /> Pendente
                        </Badge>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-muted-foreground/50">
                    <span>{currentPlan.monthly_credits.toLocaleString()} {t("billing.creditsPerMonth")}</span>
                    <span>{currentPlan.max_agents} {t("billing.agents")}</span>
                    <span>{currentPlan.max_connections} {t("billing.connections")}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {org?.current_period_end && (
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">{t("billing.validUntil")}</p>
                    <p className="text-xs font-mono text-foreground/60">
                      {new Date(org.current_period_end).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-xs border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary"
                  onClick={handleSyncSubscription}
                  disabled={syncLoading}
                >
                  {syncLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sincronizar
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border/10">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedInvoice(null); }}
              className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 transition-all ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
            >
              <tab.icon className="h-4 w-4" strokeWidth={1.5} />
              {tab.label}
              {tab.key === "invoices" && invoices.length > 0 && (
                <span className="text-[10px] bg-muted/15 px-1.5 py-0.5 rounded-md">{invoices.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "plans" && (
          <div className="space-y-10">
            {/* Period selector */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border/30 bg-secondary/20">
                {periodKeys.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className="relative flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
                    style={
                      period === p.key
                        ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }
                        : { color: 'hsl(var(--muted-foreground) / 0.7)' }
                    }
                  >
                    {t(p.labelKey)}
                    {p.discount && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                          background: period === p.key ? 'hsl(var(--primary-foreground) / 0.15)' : 'hsl(var(--destructive) / 0.15)',
                          color: period === p.key ? 'hsl(var(--primary-foreground) / 0.8)' : 'hsl(var(--destructive))',
                        }}
                      >
                        {p.discount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Plans */}
            {plansLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {(plans || []).filter(plan => plan.slug !== "free").map((plan, i) => {
                  const price = Math.round(plan.monthly_price * multiplier);
                  const Icon = planIcons[plan.slug] || Zap;
                  const isCurrentPlan = currentPlan?.id === plan.id;

                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07, duration: 0.35 }}
                      className="relative flex flex-col rounded-2xl border overflow-hidden"
                      style={{
                        background: plan.popular
                          ? 'linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--secondary) / 0.5) 100%)'
                          : 'hsl(var(--card))',
                        borderColor: isCurrentPlan
                          ? 'hsl(var(--primary) / 0.4)'
                          : plan.popular
                            ? 'hsl(var(--border) / 0.8)'
                            : 'hsl(var(--border) / 0.4)',
                        boxShadow: isCurrentPlan
                          ? '0 0 0 1px hsl(var(--primary) / 0.15), 0 8px 32px -6px hsl(var(--primary) / 0.15)'
                          : plan.popular
                            ? '0 0 0 1px hsl(0 0% 100% / 0.06), 0 8px 32px -6px hsl(0 0% 0% / 0.5)'
                            : '0 2px 12px -4px hsl(0 0% 0% / 0.3)',
                      }}
                    >
                      <div className="absolute inset-x-0 top-0 h-px"
                        style={{ background: 'linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.07), transparent)' }}
                      />
                      {plan.popular && (
                        <div className="absolute top-4 right-4">
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                          >
                            {t("billing.mostPopular")}
                          </span>
                        </div>
                      )}
                      {isCurrentPlan && (
                        <div className="absolute top-4 left-4">
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/20">
                            {t("billing.yourPlan")}
                          </span>
                        </div>
                      )}
                      <div className="flex flex-col flex-1 p-6">
                        <div className="flex items-center gap-3 mb-5">
                          <div className="h-9 w-9 rounded-xl flex items-center justify-center border border-border/30"
                            style={{ background: 'hsl(var(--secondary) / 0.6)' }}
                          >
                            <Icon className="h-4 w-4 text-foreground/70" strokeWidth={1.5} />
                          </div>
                          <span className="text-[15px] font-semibold text-foreground/90">{plan.name}</span>
                        </div>
                        <div className="mb-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-bold tracking-tight text-foreground">{formatBRLShort(price)}</span>
                            <span className="text-sm text-muted-foreground/60">{t("billing.perMonth")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/40 mt-1">{billingLabel}</p>
                        </div>
                        <div className="my-5 h-px bg-border/25" />
                        <ul className="flex flex-col gap-2.5 flex-1">
                          <li className="flex items-center gap-2.5">
                            <Check className="h-3.5 w-3.5 text-primary/60 shrink-0" strokeWidth={2.5} />
                            <span className="text-[13px] text-muted-foreground/70 font-medium">
                              {plan.monthly_credits.toLocaleString()} {t("billing.creditsPerMonth")}
                            </span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="h-3.5 w-3.5 text-primary/60 shrink-0" strokeWidth={2.5} />
                            <span className="text-[13px] text-muted-foreground/70">{plan.max_agents} {t("billing.agents")}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="h-3.5 w-3.5 text-primary/60 shrink-0" strokeWidth={2.5} />
                            <span className="text-[13px] text-muted-foreground/70">{plan.max_connections} {t("billing.connections")}</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Check className="h-3.5 w-3.5 text-primary/60 shrink-0" strokeWidth={2.5} />
                            <span className="text-[13px] text-muted-foreground/70">{plan.max_members ?? 5} {t("billing.teamMembers")}</span>
                          </li>
                          {plan.features?.map((f) => (
                            <li key={f} className="flex items-center gap-2.5">
                              <Check className="h-3.5 w-3.5 text-foreground/50 shrink-0" strokeWidth={2.5} />
                              <span className="text-[13px] text-muted-foreground/70">{featureLabelMap[f] || f}</span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          className="w-full mt-6 gap-2 font-medium"
                          variant={isCurrentPlan ? "outline" : plan.popular ? "default" : "secondary"}
                          disabled={isCurrentPlan || checkoutLoading === plan.id}
                          onClick={() => !isCurrentPlan && startCheckout(plan)}
                          style={!isCurrentPlan && !plan.popular ? {
                            background: 'hsl(var(--secondary) / 0.6)',
                            border: '1px solid hsl(var(--border) / 0.4)',
                          } : {}}
                        >
                          {checkoutLoading === plan.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isCurrentPlan ? (
                            t("billing.currentPlanBtn")
                          ) : (
                            <>
                              {t("billing.subscribe")}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </>
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Dados fiscais */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-border/30 overflow-hidden"
              style={{ background: 'hsl(var(--card))' }}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-border/20">
                <div>
                  <p className="text-[14px] font-semibold text-foreground/85">{t("billing.invoiceData")}</p>
                  <p className="text-[12px] text-muted-foreground/40 mt-0.5">
                    {billingData ? billingData.legal_name : t("billing.noInvoiceData")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-xs border-border/40 bg-secondary/20 hover:bg-secondary/40"
                  onClick={() => setBillingDataOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {billingData ? "Editar" : t("billing.register")}
                </Button>
              </div>
              <div className="px-6 py-5">
                {billingData ? (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
                    <div>
                      <span className="text-muted-foreground/40 text-[11px] uppercase tracking-wider block mb-0.5">
                        {billingData.document_type === "cnpj" ? "CNPJ" : "CPF"}
                      </span>
                      <span className="text-foreground/70 font-medium">{billingData.document_number}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/40 text-[11px] uppercase tracking-wider block mb-0.5">
                        {billingData.document_type === "cnpj" ? "Razão Social" : "Nome"}
                      </span>
                      <span className="text-foreground/70 font-medium">{billingData.legal_name}</span>
                    </div>
                    {billingData.email && (
                      <div>
                        <span className="text-muted-foreground/40 text-[11px] uppercase tracking-wider block mb-0.5">E-mail</span>
                        <span className="text-foreground/70">{billingData.email}</span>
                      </div>
                    )}
                    {billingData.phone && (
                      <div>
                        <span className="text-muted-foreground/40 text-[11px] uppercase tracking-wider block mb-0.5">Telefone</span>
                        <span className="text-foreground/70">{billingData.phone}</span>
                      </div>
                    )}
                    {(billingData.street || billingData.city) && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground/40 text-[11px] uppercase tracking-wider block mb-0.5">Endereço</span>
                        <span className="text-foreground/70">
                          {[billingData.street, billingData.number, billingData.complement, billingData.neighborhood, billingData.city, billingData.state, billingData.zip_code].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/20 bg-secondary/10 px-5 py-5 text-center">
                    <p className="text-sm text-muted-foreground/50 mb-2">{t("billing.addBillingData")}</p>
                    <div className="flex items-center justify-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'hsl(142 71% 45% / 0.6)' }} />
                        <span className="text-[11px] text-muted-foreground/40">{t("billing.secureEncrypted")}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'hsl(217 91% 60% / 0.6)' }} />
                        <span className="text-[11px] text-muted-foreground/40">{t("billing.receiveInvoices")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {org?.id && (
              <BillingDataForm
                open={billingDataOpen}
                onOpenChange={setBillingDataOpen}
                organizationId={org.id}
                existing={billingData}
                onSaved={fetchBillingData}
              />
            )}

            {/* Enterprise banner */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              className="relative rounded-2xl border border-border/25 overflow-hidden"
              style={{ background: 'hsl(var(--card))' }}
            >
              <div className="absolute top-0 right-0 w-[40%] h-full pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 80% 80% at 80% 50%, hsl(260 70% 60% / 0.07) 0%, transparent 70%)' }}
              />
              <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 px-7 py-7">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center border border-border/25 shrink-0 mt-0.5"
                    style={{ background: 'hsl(var(--secondary) / 0.5)' }}
                  >
                    <Building2 className="h-4.5 w-4.5 text-foreground/50" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-foreground/85">{t("billing.needMore")}</p>
                    <p className="text-[13px] text-muted-foreground/50 mt-1 leading-relaxed max-w-md">
                      {t("billing.needMoreDesc")}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-2 shrink-0 border-border/40 bg-secondary/20 hover:bg-secondary/40 text-[13px]">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("billing.talkSales")}
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="space-y-6">
            {selectedInvoice ? (
              <InvoiceDetail invoice={selectedInvoice} orgName={org?.name || ""} onClose={() => setSelectedInvoice(null)} />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {/* Invoice list */}
                <div className="rounded-2xl border border-border/15 bg-card overflow-hidden">
                  <div className="px-6 py-4 border-b border-border/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Receipt className="h-4 w-4 text-muted-foreground/40" strokeWidth={1.5} />
                      <h3 className="text-[14px] font-bold text-foreground">Histórico de Faturas</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/15 text-[11px] font-medium text-muted-foreground/50 hover:text-foreground hover:border-border/30 transition-all">
                        <Download className="h-3 w-3" /> Exportar
                      </button>
                    </div>
                  </div>

                  {invoicesLoading ? (
                    <div className="py-16 flex justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="py-16 text-center">
                      <div className="h-12 w-12 rounded-2xl bg-muted/10 flex items-center justify-center mx-auto mb-3">
                        <FileText className="h-5 w-5 text-muted-foreground/15" strokeWidth={1.5} />
                      </div>
                      <p className="text-[13px] text-muted-foreground/30 font-medium">Nenhuma fatura encontrada</p>
                      <p className="text-[11px] text-muted-foreground/20 mt-1">As faturas aparecerão aqui após sua primeira cobrança</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/8">
                          <th className="text-left text-[10px] font-bold text-muted-foreground/35 uppercase tracking-wider px-6 py-3">Fatura</th>
                          <th className="text-left text-[10px] font-bold text-muted-foreground/35 uppercase tracking-wider px-4 py-3">Data</th>
                          <th className="text-left text-[10px] font-bold text-muted-foreground/35 uppercase tracking-wider px-4 py-3">Vencimento</th>
                          <th className="text-left text-[10px] font-bold text-muted-foreground/35 uppercase tracking-wider px-4 py-3">Status</th>
                          <th className="text-right text-[10px] font-bold text-muted-foreground/35 uppercase tracking-wider px-4 py-3">Total</th>
                          <th className="text-right text-[10px] font-bold text-muted-foreground/35 uppercase tracking-wider px-6 py-3">Saldo</th>
                          <th className="px-4 py-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => {
                          const st = STATUS_STYLES[inv.status];
                          return (
                            <tr
                              key={inv.id}
                              onClick={() => setSelectedInvoice(inv)}
                              className="border-b border-border/5 hover:bg-muted/[0.03] cursor-pointer transition-colors group"
                            >
                              <td className="px-6 py-3.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                                    <FileText className="h-3.5 w-3.5 text-primary/50" strokeWidth={1.5} />
                                  </div>
                                  <span className="text-[13px] font-semibold text-foreground/80">{inv.number}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-[12px] text-muted-foreground/50">
                                {new Date(inv.date).toLocaleDateString("pt-BR")}
                              </td>
                              <td className="px-4 py-3.5 text-[12px] text-muted-foreground/50">
                                {new Date(inv.dueDate).toLocaleDateString("pt-BR")}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={`text-[11px] font-semibold px-2 py-1 rounded-md ${st.bg} ${st.text}`}>
                                  {st.label}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-[13px] text-right font-semibold text-foreground/70 tabular-nums">
                                {formatBRL(inv.value)}
                              </td>
                              <td className="px-6 py-3.5 text-[13px] text-right font-bold tabular-nums">
                                <span className={inv.status !== "paid" ? "text-amber-500" : "text-emerald-500"}>
                                  {inv.status === "paid" ? formatBRL(0) : formatBRL(inv.value)}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <button className="opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-foreground transition-all p-1 rounded-md hover:bg-muted/10">
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* CPF/CNPJ Dialog */}
        <Dialog open={!!cpfCnpjDialog} onOpenChange={(open) => !open && setCpfCnpjDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Informe seu CPF ou CNPJ</DialogTitle>
              <DialogDescription>
                Necessário para gerar a cobrança do plano {cpfCnpjDialog?.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                maxLength={18}
                className="text-center text-lg tracking-wider"
              />
              <p className="text-[11px] text-muted-foreground/50 mt-2 text-center">
                Seus dados são protegidos e usados apenas para faturamento.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCpfCnpjDialog(null)}>Cancelar</Button>
              <Button onClick={handleCheckout} disabled={cpfCnpj.replace(/\D/g, "").length < 11}>
                Continuar para pagamento
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
