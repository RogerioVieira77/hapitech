import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";
import { useSearchParams } from "react-router-dom";
import { Bot, Plus, Pencil, Trash2, Pause, Play, MoreVertical, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAgents, useCreateAgent, useDeleteAgent, useUpdateAgent, type Agent } from "@/hooks/useAgents";
import { AgentEditor } from "@/components/AgentEditor";
import { PageTransition } from "@/components/PageTransition";
import { usePlanLimits } from "@/hooks/usePlan";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FilterTab = "all" | "active" | "paused";

export default function Agents() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: agents, isLoading } = useAgents();
  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();
  const updateAgent = useUpdateAgent();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const { canCreateAgent, maxAgents, currentAgents } = usePlanLimits();

  const editingAgentId = searchParams.get("edit");
  const editingSection = (searchParams.get("section") || "perfil") as "perfil" | "canais";
  const editingAgent = useMemo(() => {
    if (!editingAgentId || !agents) return null;
    return agents.find(a => a.id === editingAgentId) ?? null;
  }, [editingAgentId, agents]);

  const openEditor = (agent: Agent, section: "perfil" | "canais" = "perfil") => {
    setSearchParams({ edit: agent.id, section });
  };

  const handleSectionChange = (section: string) => {
    if (editingAgentId) {
      setSearchParams({ edit: editingAgentId, section });
    }
  };

  const handleCreate = () => {
    if (!canCreateAgent) {
      toast.error(`${t("billing.limitReached")}: ${currentAgents}/${maxAgents} ${t("billing.agents")}. ${t("billing.upgradePlan")}`);
      return;
    }
    createAgent.mutate({ name: "Novo Agente", instructions: "Você é um assistente útil e amigável." }, {
      onSuccess: (agent) => setSearchParams({ edit: agent.id }),
    });
  };

  const handleToggleStatus = (agent: Agent) => {
    updateAgent.mutate({
      id: agent.id,
      status: agent.status === "active" ? "paused" : "active",
    });
  };

  const filtered = useMemo(() => {
    if (!agents) return [];
    if (activeTab === "active") return agents.filter(a => a.status === "active");
    if (activeTab === "paused") return agents.filter(a => a.status !== "active");
    return agents;
  }, [agents, activeTab]);

  if (editingAgent) {
    return (
      <PageTransition>
        <AgentEditor
          agent={editingAgent}
          onBack={() => setSearchParams({})}
          onSave={() => {}}
          initialSection={editingSection}
          onSectionChange={handleSectionChange}
        />
      </PageTransition>
    );
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t("agents.filterAll") },
    { key: "active", label: t("agents.filterActive") },
    { key: "paused", label: t("agents.filterInactive") },
  ];

  return (
    <PageTransition>
      <div className="space-y-10 w-full">
        {/* Header — Apple-style clean */}
        <motion.div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 page-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">{t("agents.title")}</h1>
            <p className="text-[13px] text-muted-foreground/88 mt-1.5">Gerencie seus agentes de IA</p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={createAgent.isPending}
            className="gap-2.5 h-11 px-6 rounded-2xl text-sm font-medium transition-all duration-200 btn-accent"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Criar agente</span><span className="sm:hidden">Criar</span>
          </Button>
        </motion.div>

        {/* Tabs — minimal pill style */}
        <motion.div
          className="flex gap-1 bg-muted/40 p-1 rounded-2xl w-fit"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 text-[13px] font-medium rounded-xl transition-all duration-200 ${
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* Agent list — clean card */}
        <motion.div
          className="rounded-3xl border border-border/10 overflow-hidden bg-card stat-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {isLoading ? (
            <div className="divide-y divide-border/8">
              {[1, 2, 3].map(i => (
                <div key={i} className="px-6 py-5 flex items-center gap-5 animate-pulse">
                  <div className="h-12 w-12 rounded-2xl bg-muted/40" />
                  <div className="space-y-2.5 flex-1">
                    <div className="h-3.5 w-36 bg-muted/40 rounded-lg" />
                    <div className="h-3 w-52 bg-muted/30 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="p-4 rounded-2xl bg-muted/30">
                <Bot className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground/60">Nenhum agente encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-border/8">
              {filtered.map((agent, i) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="px-6 py-4 flex items-center gap-5 hover:bg-muted/20 transition-all duration-200 cursor-pointer group"
                  onClick={() => openEditor(agent)}
                >
                  <Avatar className="h-12 w-12 rounded-2xl shrink-0">
                    <AvatarImage src={agent.avatar_url ?? undefined} alt={agent.name} className="rounded-2xl" />
                    <AvatarFallback className="bg-muted/40 text-muted-foreground text-sm font-semibold rounded-2xl">
                      {agent.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[15px] font-semibold truncate text-foreground">{agent.name}</span>
                      <span
                        className={`inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                          agent.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted/50 text-muted-foreground/60"
                        }`}
                      >
                        {agent.status === "active" ? t("agents.active") : t("agents.paused")}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted-foreground/50 truncate mt-0.5">
                      {agent.purpose === "vendas" ? "Vendedor" : agent.purpose === "suporte" ? "Suporte" : "Agente"} em {agent.product_name || agent.name}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground/30 hover:text-foreground hover:bg-muted/30 opacity-0 group-hover:opacity-100 transition-all">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl border-border/20 shadow-lg">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditor(agent); }} className="gap-2.5 rounded-lg">
                        <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleStatus(agent); }} className="gap-2.5 rounded-lg">
                        {agent.status === "active" ? <><Pause className="h-3.5 w-3.5" /> {t("agents.pause")}</> : <><Play className="h-3.5 w-3.5" /> {t("agents.activate")}</>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-border/10" />
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeleteId(agent.id); }} className="gap-2.5 text-destructive focus:text-destructive rounded-lg">
                        <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("agents.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("agents.deleteDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { if (deleteId) { deleteAgent.mutate(deleteId); setDeleteId(null); } }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}
