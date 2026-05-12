import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Bot, MessageSquare, Plug, Kanban, ListTodo,
  Contact, BarChart3, UsersRound, Sparkles, ArrowRight,
  ArrowLeft, X, Rocket, Zap, TrendingUp, Users, Send,
  Calendar, Star, CheckCircle2, Bell, Search, Plus,
  FileText, Tag, Filter, Settings, Globe, Phone, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/hooks/useLanguage";
import mvoLogo from "@/assets/mvo-logo-new.png";

interface Step {
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  color: string;
  accent: string;
}

const steps: Step[] = [
  { icon: Sparkles, titleKey: "onboarding.welcome.title", descKey: "onboarding.welcome.desc", color: "hsl(var(--accent))", accent: "accent" },
  { icon: LayoutDashboard, titleKey: "onboarding.dashboard.title", descKey: "onboarding.dashboard.desc", color: "#3b82f6", accent: "blue" },
  { icon: Bot, titleKey: "onboarding.agents.title", descKey: "onboarding.agents.desc", color: "#8b5cf6", accent: "violet" },
  { icon: MessageSquare, titleKey: "onboarding.chat.title", descKey: "onboarding.chat.desc", color: "#10b981", accent: "emerald" },
  { icon: Plug, titleKey: "onboarding.channels.title", descKey: "onboarding.channels.desc", color: "#f97316", accent: "orange" },
  { icon: Kanban, titleKey: "onboarding.crm.title", descKey: "onboarding.crm.desc", color: "#ec4899", accent: "pink" },
  { icon: Contact, titleKey: "onboarding.contacts.title", descKey: "onboarding.contacts.desc", color: "#06b6d4", accent: "cyan" },
  { icon: ListTodo, titleKey: "onboarding.tasks.title", descKey: "onboarding.tasks.desc", color: "#f59e0b", accent: "amber" },
  { icon: BarChart3, titleKey: "onboarding.reports.title", descKey: "onboarding.reports.desc", color: "#14b8a6", accent: "teal" },
  { icon: UsersRound, titleKey: "onboarding.teams.title", descKey: "onboarding.teams.desc", color: "#6366f1", accent: "indigo" },
  { icon: Rocket, titleKey: "onboarding.finish.title", descKey: "onboarding.finish.desc", color: "hsl(var(--accent))", accent: "accent" },
];

const STORAGE_KEY = "mvo-onboarding-done";

/* ── Mini UI mockups for each step ── */

function WelcomeMockup() {
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 294.49 374.89" className="h-12 w-auto">
        <path fill="hsl(var(--foreground))" d="M115.38,177.89c50.18-43.06,147.67-44.04,169.41,29.75,8.4,28.53,8.91,98.23,4.19,127.98-6.46,40.7-62.21,52.34-88.67,22.69-23.38-26.2-6.3-78.95-14.58-110.17-8.76-33.04-55.05-29.19-70.16-3.36-.85,21.28-.15,42.89-1.11,64.14-.62,13.7-1.64,25.27-8.87,37.2-20.21,33.35-66.39,36.16-91.49,6.44-11.6-13.73-10.96-22-12-38.87C-3.36,224.48,3.84,131.23,1.6,41.59,14.5,12.63,31.66-2.6,64.97.37c21.99,1.96,45.33,22.41,47.52,44.62,1.62,16.45,1.62,34.26,1.97,50.81.58,27.37-.9,54.85.93,82.09h0Z"/>
        <path fill="#85bc2d" d="M179.69,113.12c-.21-.73-7.31-9.24-8.81-12.31-30.49-62.26,43.02-123.17,98-81.66,41.37,31.24,30.77,97.55-18.37,113.91-13.75,4.58-52.73,5.35-67.51,3.62-.97-.11-3.31-.44-3.31-1.49,0-4.7.94-18.8,0-22.07h0Z"/>
      </svg>
      <div className="flex gap-2 mt-1">
        {[Sparkles, Bot, MessageSquare].map((I, i) => (
          <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + i * 0.1 }}
            className="h-9 w-9 rounded-xl bg-card/80 flex items-center justify-center shadow-sm">
            <I className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function DashboardMockup({ color }: { color: string }) {
  const bars = [35, 55, 42, 68, 52, 75, 60];
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl p-3 shadow-lg border border-border/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <LayoutDashboard className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold text-foreground/80">Dashboard</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[{ v: "1.2k", l: "Atendimentos" }, { v: "384", l: "Leads" }, { v: "89%", l: "Resolução" }].map((k, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
            className="bg-background/60 rounded-lg p-1.5 text-center">
            <div className="text-[11px] font-bold text-foreground/90">{k.v}</div>
            <div className="text-[7px] text-muted-foreground">{k.l}</div>
          </motion.div>
        ))}
      </div>
      <div className="flex items-end gap-[3px] h-10">
        {bars.map((h, i) => (
          <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 0.4 + i * 0.05, duration: 0.4 }}
            className="flex-1 rounded-sm" style={{ background: color + "80" }} />
        ))}
      </div>
    </div>
  );
}

function AgentsMockup({ color }: { color: string }) {
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl p-3 shadow-lg border border-border/20 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
          <span className="text-[10px] font-semibold text-foreground/80">Agentes de IA</span>
        </div>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 }}
          className="h-5 px-2 rounded-md text-[8px] font-medium flex items-center gap-1 text-white" style={{ background: color }}>
          <Plus className="h-2.5 w-2.5" /> Criar
        </motion.div>
      </div>
      {["Vendas 24/7", "Suporte Técnico", "Qualificação"].map((name, i) => (
        <motion.div key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.12 }}
          className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-[9px] font-bold"
            style={{ background: `${color}${i === 0 ? '' : '90'}` }}>
            {name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-medium text-foreground/80 truncate">{name}</div>
            <div className="text-[7px] text-muted-foreground">GPT-4o · Ativo</div>
          </div>
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </motion.div>
      ))}
    </div>
  );
}

function ChatMockup({ color }: { color: string }) {
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl shadow-lg border border-border/20 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/15">
        <MessageSquare className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold text-foreground/80">Chat ao Vivo</span>
        <div className="ml-auto flex items-center gap-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Bell className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
      <div className="flex h-[100px]">
        <div className="w-[85px] border-r border-border/10 p-1.5 space-y-1">
          {["João Silva", "Maria O.", "Pedro L."].map((n, i) => (
            <motion.div key={i} initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.1 }}
              className={`p-1 rounded-md text-[7px] truncate ${i === 0 ? 'bg-accent/10 font-semibold text-foreground/90' : 'text-muted-foreground'}`}>
              {n}
            </motion.div>
          ))}
        </div>
        <div className="flex-1 p-2 flex flex-col justify-end gap-1">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="self-start bg-muted/40 rounded-lg rounded-tl-sm px-2 py-1 text-[7px] text-foreground/70 max-w-[80%]">
            Olá, preciso de ajuda com meu pedido
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
            className="self-end rounded-lg rounded-tr-sm px-2 py-1 text-[7px] text-white max-w-[80%]" style={{ background: color }}>
            Claro! Vou verificar para você 😊
          </motion.div>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex-1 h-5 rounded-full bg-muted/30 border border-border/10 px-2 text-[7px] text-muted-foreground flex items-center">
              Digite uma mensagem...
            </div>
            <div className="h-5 w-5 rounded-full flex items-center justify-center" style={{ background: color }}>
              <Send className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelsMockup({ color }: { color: string }) {
  const channels = [
    { name: "WhatsApp", icon: Phone, connected: true },
    { name: "Telegram", icon: Send, connected: true },
    { name: "Widget Web", icon: Globe, connected: false },
    { name: "Calendar", icon: Calendar, connected: false },
  ];
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl p-3 shadow-lg border border-border/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <Plug className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold text-foreground/80">Canais</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {channels.map((ch, i) => (
          <motion.div key={i} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 + i * 0.1 }}
            className="flex items-center gap-1.5 p-2 rounded-lg bg-background/50 border border-border/10">
            <ch.icon className="h-3.5 w-3.5" style={{ color: ch.connected ? color : undefined }} strokeWidth={1.5} />
            <div className="min-w-0">
              <div className="text-[8px] font-medium text-foreground/80 truncate">{ch.name}</div>
              <div className={`text-[6px] ${ch.connected ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {ch.connected ? '● Conectado' : '○ Conectar'}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CrmMockup({ color }: { color: string }) {
  const cols = [
    { name: "Novo", items: ["Ana Costa", "Carlos M."] },
    { name: "Contato", items: ["Julia R."] },
    { name: "Proposta", items: ["Pedro S.", "Marta L."] },
  ];
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl p-3 shadow-lg border border-border/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <Kanban className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold text-foreground/80">Pipeline</span>
      </div>
      <div className="flex gap-1.5">
        {cols.map((col, ci) => (
          <div key={ci} className="flex-1 min-w-0">
            <div className="text-[7px] font-semibold text-muted-foreground mb-1 px-0.5">{col.name}</div>
            <div className="space-y-1">
              {col.items.map((item, ii) => (
                <motion.div key={ii} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + ci * 0.1 + ii * 0.08 }}
                  className="p-1.5 rounded-md bg-background/60 border border-border/10">
                  <div className="text-[7px] font-medium text-foreground/80 truncate">{item}</div>
                  <div className="text-[6px] text-muted-foreground">R$ {(Math.random() * 10 + 2).toFixed(1)}k</div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactsMockup({ color }: { color: string }) {
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl p-3 shadow-lg border border-border/20 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Contact className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
          <span className="text-[10px] font-semibold text-foreground/80">Contatos</span>
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <Tag className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
      {["Ana Costa", "João Silva", "Maria Oliveira"].map((n, i) => (
        <motion.div key={i} initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.1 }}
          className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
          <div className="h-6 w-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: color }}>
            {n.split(' ').map(w => w[0]).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[8px] font-medium text-foreground/80">{n}</div>
            <div className="text-[6px] text-muted-foreground">+55 11 9****-{(1000 + i * 111)}</div>
          </div>
          <div className="h-3 px-1.5 rounded text-[6px] font-medium flex items-center" style={{ background: color + '18', color }}>VIP</div>
        </motion.div>
      ))}
    </div>
  );
}

function TasksMockup({ color }: { color: string }) {
  const tasks = [
    { title: "Follow-up Ana Costa", type: "Ligação", done: true },
    { title: "Enviar proposta Pedro", type: "Email", done: false },
    { title: "Reunião com equipe", type: "Reunião", done: false },
  ];
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl p-3 shadow-lg border border-border/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <ListTodo className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold text-foreground/80">Tarefas</span>
      </div>
      {tasks.map((t, i) => (
        <motion.div key={i} initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.1 }}
          className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
          <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${t.done ? '' : 'border-border/40'}`}
            style={t.done ? { background: color, borderColor: color } : undefined}>
            {t.done && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[8px] font-medium ${t.done ? 'line-through text-muted-foreground' : 'text-foreground/80'}`}>{t.title}</div>
          </div>
          <div className="text-[6px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{t.type}</div>
        </motion.div>
      ))}
    </div>
  );
}

function ReportsMockup({ color }: { color: string }) {
  const data = [20, 35, 28, 50, 42, 65, 55, 70, 60, 80];
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl p-3 shadow-lg border border-border/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold text-foreground/80">Relatórios</span>
        <div className="ml-auto flex items-center gap-1 text-[7px] text-emerald-500 font-medium">
          <TrendingUp className="h-2.5 w-2.5" /> +24%
        </div>
      </div>
      <svg viewBox="0 0 200 60" className="w-full h-14">
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.3, duration: 1 }}
          d={`M ${data.map((v, i) => `${i * (200 / (data.length - 1))},${60 - v * 0.7}`).join(' L ')}`}
          fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
        />
        <motion.path
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.1 }}
          transition={{ delay: 0.8 }}
          d={`M 0,60 L ${data.map((v, i) => `${i * (200 / (data.length - 1))},${60 - v * 0.7}`).join(' L ')} L 200,60 Z`}
          fill={color}
        />
      </svg>
      <div className="flex justify-between mt-1">
        {["Seg", "Ter", "Qua", "Qui", "Sex"].map((d, i) => (
          <span key={i} className="text-[6px] text-muted-foreground">{d}</span>
        ))}
      </div>
    </div>
  );
}

function TeamsMockup({ color }: { color: string }) {
  const members = [
    { name: "Você", role: "Admin", initials: "VX" },
    { name: "Carlos", role: "Usuário", initials: "CM" },
    { name: "Julia", role: "Usuário", initials: "JR" },
  ];
  return (
    <div className="w-full max-w-[280px] bg-card/90 rounded-xl p-3 shadow-lg border border-border/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <UsersRound className="h-3.5 w-3.5" style={{ color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold text-foreground/80">Equipe</span>
      </div>
      {members.map((m, i) => (
        <motion.div key={i} initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.1 }}
          className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
          <div className="h-6 w-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: color }}>
            {m.initials}
          </div>
          <div className="flex-1">
            <div className="text-[8px] font-medium text-foreground/80">{m.name}</div>
          </div>
          <div className="text-[6px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{m.role}</div>
        </motion.div>
      ))}
    </div>
  );
}

function FinishMockup() {
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}>
        <Rocket className="h-12 w-12 text-accent" strokeWidth={1.5} />
      </motion.div>
      <div className="flex gap-1.5">
        {[CheckCircle2, Star, Zap].map((I, i) => (
          <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 + i * 0.1 }}
            className="h-7 w-7 rounded-lg bg-card/80 flex items-center justify-center shadow-sm">
            <I className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const mockupRenderers: Record<number, (color: string) => React.ReactNode> = {
  0: () => <WelcomeMockup />,
  1: (c) => <DashboardMockup color={c} />,
  2: (c) => <AgentsMockup color={c} />,
  3: (c) => <ChatMockup color={c} />,
  4: (c) => <ChannelsMockup color={c} />,
  5: (c) => <CrmMockup color={c} />,
  6: (c) => <ContactsMockup color={c} />,
  7: (c) => <TasksMockup color={c} />,
  8: (c) => <ReportsMockup color={c} />,
  9: (c) => <TeamsMockup color={c} />,
  10: () => <FinishMockup />,
};

const fallback: Record<string, Record<string, string>> = {
  pt: {
    "onboarding.welcome.title": "Bem-vindo ao Meu Vendedor Online! 🎉",
    "onboarding.welcome.desc": "Vamos fazer um tour rápido pela plataforma para você conhecer tudo o que pode fazer. São poucos passos e você vai dominar todas as funcionalidades!",
    "onboarding.dashboard.title": "Dashboard Inteligente",
    "onboarding.dashboard.desc": "Acompanhe todos os KPIs do seu negócio em tempo real: atendimentos, leads, conversões, créditos e muito mais. Filtre por período e veja gráficos detalhados.",
    "onboarding.agents.title": "Agentes de IA",
    "onboarding.agents.desc": "Crie e configure agentes inteligentes que atendem seus clientes 24/7. Defina personalidade, modelo de IA, base de conhecimento, regras de transferência e muito mais.",
    "onboarding.chat.title": "Chat ao Vivo",
    "onboarding.chat.desc": "Gerencie todas as conversas em um único lugar. Veja o histórico, envie mensagens, transfira para humanos, adicione tags e notas aos contatos.",
    "onboarding.channels.title": "Canais & Integrações",
    "onboarding.channels.desc": "Conecte WhatsApp, Telegram, Widget Web, Google Calendar e muito mais. Seus agentes atendem em todos os canais simultaneamente.",
    "onboarding.crm.title": "CRM & Pipeline",
    "onboarding.crm.desc": "Gerencie seus leads com um pipeline visual de arrastar e soltar. Crie etapas personalizadas, atribua valores e acompanhe cada negociação.",
    "onboarding.contacts.title": "Contatos",
    "onboarding.contacts.desc": "Base completa de contatos com campos customizáveis, histórico de conversas, tags e filtros avançados para segmentação.",
    "onboarding.tasks.title": "Tarefas & Atividades",
    "onboarding.tasks.desc": "Organize follow-ups, reuniões, ligações e e-mails. Atribua a membros da equipe, defina prazos e acompanhe o progresso.",
    "onboarding.reports.title": "Relatórios & Analytics",
    "onboarding.reports.desc": "Visualize métricas detalhadas de desempenho, tempo de resposta, volume de atendimentos e taxa de resolução dos seus agentes.",
    "onboarding.teams.title": "Equipe & Organização",
    "onboarding.teams.desc": "Convide membros, defina permissões (admin, usuário), gerencie planos da organização e mantenha tudo organizado.",
    "onboarding.finish.title": "Tudo pronto! 🚀",
    "onboarding.finish.desc": "Você já conhece todas as funcionalidades! Comece criando seu primeiro agente de IA e conectando um canal de atendimento. Estamos aqui para ajudar!",
    "onboarding.skip": "Pular tour",
    "onboarding.next": "Próximo",
    "onboarding.prev": "Anterior",
    "onboarding.start": "Começar agora",
    "onboarding.step": "Passo",
    "onboarding.of": "de",
  },
  en: {
    "onboarding.welcome.title": "Welcome to Meu Vendedor Online! 🎉",
    "onboarding.welcome.desc": "Let's take a quick tour of the platform so you can discover everything you can do. Just a few steps and you'll master all features!",
    "onboarding.dashboard.title": "Smart Dashboard",
    "onboarding.dashboard.desc": "Track all your business KPIs in real time: conversations, leads, conversions, credits and more. Filter by period and see detailed charts.",
    "onboarding.agents.title": "AI Agents",
    "onboarding.agents.desc": "Create and configure intelligent agents that serve your customers 24/7. Set personality, AI model, knowledge base, transfer rules and more.",
    "onboarding.chat.title": "Live Chat",
    "onboarding.chat.desc": "Manage all conversations in one place. View history, send messages, transfer to humans, add tags and notes to contacts.",
    "onboarding.channels.title": "Channels & Integrations",
    "onboarding.channels.desc": "Connect WhatsApp, Telegram, Web Widget, Google Calendar and more. Your agents serve on all channels simultaneously.",
    "onboarding.crm.title": "CRM & Pipeline",
    "onboarding.crm.desc": "Manage your leads with a visual drag-and-drop pipeline. Create custom stages, assign values and track each deal.",
    "onboarding.contacts.title": "Contacts",
    "onboarding.contacts.desc": "Complete contact base with custom fields, conversation history, tags and advanced filters for segmentation.",
    "onboarding.tasks.title": "Tasks & Activities",
    "onboarding.tasks.desc": "Organize follow-ups, meetings, calls and emails. Assign to team members, set deadlines and track progress.",
    "onboarding.reports.title": "Reports & Analytics",
    "onboarding.reports.desc": "View detailed performance metrics, response time, conversation volume and resolution rate of your agents.",
    "onboarding.teams.title": "Team & Organization",
    "onboarding.teams.desc": "Invite members, set permissions (admin, user), manage organization plans and keep everything organized.",
    "onboarding.finish.title": "All set! 🚀",
    "onboarding.finish.desc": "You now know all the features! Start by creating your first AI agent and connecting a support channel. We're here to help!",
    "onboarding.skip": "Skip tour",
    "onboarding.next": "Next",
    "onboarding.prev": "Previous",
    "onboarding.start": "Get started",
    "onboarding.step": "Step",
    "onboarding.of": "of",
  },
  es: {
    "onboarding.welcome.title": "¡Bienvenido a Meu Vendedor Online! 🎉",
    "onboarding.welcome.desc": "Hagamos un tour rápido por la plataforma para que descubras todo lo que puedes hacer. ¡Pocos pasos y dominarás todas las funcionalidades!",
    "onboarding.dashboard.title": "Dashboard Inteligente",
    "onboarding.dashboard.desc": "Sigue todos los KPIs de tu negocio en tiempo real: atenciones, leads, conversiones, créditos y más. Filtra por período y ve gráficos detallados.",
    "onboarding.agents.title": "Agentes de IA",
    "onboarding.agents.desc": "Crea y configura agentes inteligentes que atienden a tus clientes 24/7. Define personalidad, modelo de IA, base de conocimiento y más.",
    "onboarding.chat.title": "Chat en Vivo",
    "onboarding.chat.desc": "Gestiona todas las conversaciones en un solo lugar. Ve el historial, envía mensajes, transfiere a humanos, agrega etiquetas y notas.",
    "onboarding.channels.title": "Canales e Integraciones",
    "onboarding.channels.desc": "Conecta WhatsApp, Telegram, Widget Web, Google Calendar y más. Tus agentes atienden en todos los canales simultáneamente.",
    "onboarding.crm.title": "CRM & Pipeline",
    "onboarding.crm.desc": "Gestiona tus leads con un pipeline visual de arrastrar y soltar. Crea etapas personalizadas, asigna valores y sigue cada negociación.",
    "onboarding.contacts.title": "Contactos",
    "onboarding.contacts.desc": "Base completa de contactos con campos personalizables, historial de conversaciones, etiquetas y filtros avanzados.",
    "onboarding.tasks.title": "Tareas y Actividades",
    "onboarding.tasks.desc": "Organiza follow-ups, reuniones, llamadas y correos. Asigna a miembros del equipo, define plazos y sigue el progreso.",
    "onboarding.reports.title": "Reportes & Analytics",
    "onboarding.reports.desc": "Visualiza métricas detalladas de rendimiento, tiempo de respuesta, volumen de atenciones y tasa de resolución.",
    "onboarding.teams.title": "Equipo & Organización",
    "onboarding.teams.desc": "Invita miembros, define permisos (admin, usuario), gestiona planes de la organización y mantén todo organizado.",
    "onboarding.finish.title": "¡Todo listo! 🚀",
    "onboarding.finish.desc": "¡Ya conoces todas las funcionalidades! Empieza creando tu primer agente de IA y conectando un canal de atención. ¡Estamos aquí para ayudar!",
    "onboarding.skip": "Saltar tour",
    "onboarding.next": "Siguiente",
    "onboarding.prev": "Anterior",
    "onboarding.start": "Empezar ahora",
    "onboarding.step": "Paso",
    "onboarding.of": "de",
  },
};

export function OnboardingWizard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const { locale } = useLanguage();

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setOpen(true);
  }, []);

  const tx = (key: string) => {
    const loc = fallback[locale] ?? fallback.pt;
    return loc[key] ?? fallback.pt[key] ?? key;
  };

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  const next = () => {
    if (current >= steps.length - 1) return finish();
    setDirection(1);
    setCurrent((p) => p + 1);
  };

  const prev = () => {
    setDirection(-1);
    setCurrent((p) => Math.max(0, p - 1));
  };

  const progress = ((current + 1) / steps.length) * 100;
  const step = steps[current];
  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden border border-border/30"
        >
          {/* Preview area */}
          <div className="relative bg-muted/30 px-6 pt-5 pb-4 flex items-center justify-center min-h-[200px]">
            {/* Skip button */}
            {!isLast && (
              <button
                onClick={finish}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-card/80 backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-card transition-all z-10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Step dots */}
            <div className="absolute top-3 left-3 flex items-center gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === current ? "w-5" : "w-1.5"
                  }`}
                  style={{
                    background: i === current ? step.color : i < current ? step.color + '60' : 'hsl(var(--border))',
                  }}
                />
              ))}
            </div>

            {/* Animated mockup */}
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ x: direction * 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction * -80, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full flex justify-center"
              >
                {mockupRenderers[current]?.(step.color)}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Content */}
          <div className="px-6 pt-4 pb-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -16, opacity: 0 }}
                transition={{ duration: 0.25, delay: 0.05 }}
              >
                <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 tracking-widest uppercase">
                  {tx("onboarding.step")} {current + 1} {tx("onboarding.of")} {steps.length}
                </p>
                <h2 className="text-lg font-bold text-foreground mb-2 leading-tight">
                  {tx(step.titleKey)}
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {tx(step.descKey)}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Progress */}
          <div className="px-6">
            <Progress value={progress} className="h-0.5" />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-6 py-4">
            {!isFirst ? (
              <Button variant="ghost" size="sm" onClick={prev} className="gap-1.5 text-xs">
                <ArrowLeft className="h-3.5 w-3.5" /> {tx("onboarding.prev")}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={finish} className="text-muted-foreground text-xs">
                {tx("onboarding.skip")}
              </Button>
            )}

            {isLast ? (
              <Button onClick={finish} size="sm" className="gap-1.5 bg-accent hover:bg-accent/90 text-accent-foreground">
                <Zap className="h-3.5 w-3.5" /> {tx("onboarding.start")}
              </Button>
            ) : (
              <Button onClick={next} size="sm" className="gap-1.5">
                {tx("onboarding.next")} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Re-trigger onboarding (e.g. from settings) */
export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
