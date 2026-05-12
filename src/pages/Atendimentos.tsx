import { useState, useMemo } from "react";
import { useOrgUserIds } from "@/hooks/useOrgUserIds";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Headset, Search, Filter, Download, MoreVertical, ChevronLeft, ChevronRight, ChevronsRight, Bot, UserCircle } from "lucide-react";
import { useAgents } from "@/hooks/useAgents";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import whatsappLogo from "@/assets/whatsapp-logo.webp";
import telegramLogo from "@/assets/telegram-logo.png";
import instagramLogo from "@/assets/instagram-logo.png";
import webchatLogo from "@/assets/webchat-logo.png";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PAGE_SIZE = 7;

interface ConversationRow {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  remote_jid: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  is_ai_active: boolean | null;
  agent_id: string | null;
  connection_id: string | null;
  profile_picture_url: string | null;
  agent?: { name: string } | null;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function getChannel(jid: string): { name: string; logo: string } {
  if (jid.includes("@g.us") || jid.includes("@s.whatsapp")) return { name: "WhatsApp", logo: whatsappLogo };
  if (jid.includes("telegram")) return { name: "Telegram", logo: telegramLogo };
  if (jid.includes("instagram")) return { name: "Instagram", logo: instagramLogo };
  if (jid.includes("widget")) return { name: "Widget", logo: webchatLogo };
  return { name: "WhatsApp", logo: whatsappLogo };
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "-";
  try {
    return formatDistanceStrict(new Date(start), new Date(end), { locale: ptBR });
  } catch {
    return "-";
  }
}

export default function Atendimentos() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [agentFilter, setAgentFilter] = useState<string>("all");

  const { data: agents = [] } = useAgents();

  const { data: orgUserIds, isLoading: orgLoading } = useOrgUserIds();
  const uids = orgUserIds ?? [];
  const orgReady = !orgLoading && uids.length > 0;

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["atendimentos", uids],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*, agent:agents(name)")
        .in("user_id", uids)
        .order("last_message_at", { ascending: false });
      return (data || []) as ConversationRow[];
    },
    enabled: !!user && orgReady,
  });

  const filtered = useMemo(() => {
    let list = conversations;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.contact_name || "").toLowerCase().includes(q) ||
        (c.contact_phone || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      if (statusFilter === "em_andamento") {
        list = list.filter(c => c.is_ai_active);
      } else if (statusFilter === "concluido") {
        list = list.filter(c => !c.is_ai_active);
      }
    }
    if (agentFilter !== "all") {
      list = list.filter(c => c.agent_id === agentFilter);
    }
    return list;
  }, [conversations, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleExport = () => {
    if (!filtered.length) return;
    const headers = ["Nome", "Canal", "Status", "Responsável", "Início", "Fim", "Duração"];
    const rows = filtered.map(c => {
      const channel = getChannel(c.remote_jid).name;
      const status = c.is_ai_active ? "EM ANDAMENTO" : "CONCLUÍDO";
      const responsible = c.agent?.name || "N/A";
      const start = c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy - HH:mm") : "-";
      const end = c.last_message_at ? format(new Date(c.last_message_at), "dd/MM/yyyy, HH:mm") : "-";
      const duration = formatDuration(c.created_at, c.last_message_at);
      return [c.contact_name || c.remote_jid, channel, status, responsible, start, end, duration];
    });
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "atendimentos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageTransition>
      <div className="flex-1 min-h-full space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-primary/10">
              <Headset className="h-5 w-5 text-primary" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Atendimentos</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Listagem dos atendimentos do seu time</p>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs rounded-lg w-auto min-w-[160px] gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Todos agentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos agentes</SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {filtered.length} atendimentos
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 rounded-lg">
                    <Filter className="h-3.5 w-3.5" /> Filtrar
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 p-2">
                  <button onClick={() => { setStatusFilter(null); setPage(1); }} className={`w-full text-left text-xs px-3 py-2 rounded-md transition-colors ${!statusFilter ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                    Todos
                  </button>
                  <button onClick={() => { setStatusFilter("em_andamento"); setPage(1); }} className={`w-full text-left text-xs px-3 py-2 rounded-md transition-colors ${statusFilter === "em_andamento" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                    Em Andamento
                  </button>
                  <button onClick={() => { setStatusFilter("concluido"); setPage(1); }} className={`w-full text-left text-xs px-3 py-2 rounded-md transition-colors ${statusFilter === "concluido" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                    Concluído
                  </button>
                </PopoverContent>
              </Popover>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Buscar por nome ou telefone..."
                  className="h-8 pl-8 pr-3 text-xs w-56 bg-background border-border/40 rounded-lg"
                />
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 rounded-lg" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" /> Exportar
              </Button>
            </div>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium">Nome</TableHead>
                <TableHead className="text-xs font-medium">Canal</TableHead>
                <TableHead className="text-xs font-medium">Status</TableHead>
                <TableHead className="text-xs font-medium">Responsável</TableHead>
                <TableHead className="text-xs font-medium">Início</TableHead>
                <TableHead className="text-xs font-medium">Fim</TableHead>
                <TableHead className="text-xs font-medium">Duração</TableHead>
                <TableHead className="text-xs font-medium">Protocolo</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-muted/40 rounded animate-pulse w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    Nenhum atendimento encontrado
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((c) => {
                  const name = c.contact_name || c.remote_jid.split("@")[0];
                  const channel = getChannel(c.remote_jid);
                  const isActive = c.is_ai_active;
                  const startDate = c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy - HH:mm") : "-";
                  const endDate = c.last_message_at && !isActive ? format(new Date(c.last_message_at), "dd/MM/yyyy, HH:mm") : "-";
                  const duration = !isActive ? formatDuration(c.created_at, c.last_message_at) : "-";
                  const protocol = `#${c.id.slice(0, 4).toUpperCase()}`;

                  return (
                    <TableRow key={c.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="h-9 w-9 border border-border/30">
                              {c.profile_picture_url && <AvatarImage src={c.profile_picture_url} alt={name} />}
                              <AvatarFallback className="text-[11px] font-bold bg-secondary/50 text-muted-foreground">
                                {getInitials(name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-card" />
                          </div>
                          <span className="text-sm font-medium text-foreground">{name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <img src={channel.logo} alt={channel.name} className="h-5 w-5 rounded-full object-cover" />
                          <span className="text-xs text-muted-foreground">{channel.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-foreground/70">
                          {isActive ? "Em andamento" : "Concluído"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {c.agent?.name || "N/A"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{startDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{endDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{duration}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{protocol}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-xs">Ver conversa</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs">Ver contato</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 py-4 border-t border-border/30">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setPage(pageNum)}
                    className={`h-8 w-8 p-0 text-xs ${page === pageNum ? "rounded-full" : ""}`}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              {totalPages > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
