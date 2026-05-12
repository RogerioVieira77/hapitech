import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListTodo, Search, CircleCheck, Clock, CalendarDays, Plus, Trash2, User2,
  MessageSquare, ChevronLeft, ChevronRight, List, Calendar, Users,
  PhoneCall, Mail, Handshake, RotateCcw, UserPlus, CheckSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgMembers } from "@/hooks/useOrganization";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";
import {
  addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  format, isSameDay, isSameMonth, isToday, addMonths, subMonths, addWeeks, subWeeks,
  eachDayOfInterval, getDay, parse, setHours, setMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface TaskWithLead {
  id: string;
  lead_id: string;
  user_id: string;
  title: string;
  description: string;
  task_type?: string;
  due_date: string | null;
  assigned_to: string | null;
  status: string;
  created_at: string;
  lead_name?: string;
  due_time?: string | null;
}

const TASK_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  task:          { label: "Tarefa",          icon: CheckSquare, color: "text-primary",        bg: "bg-primary/10" },
  follow_up:    { label: "Follow Up",       icon: RotateCcw,   color: "text-amber-500",      bg: "bg-amber-500/10" },
  meeting:      { label: "Reunião",         icon: Handshake,   color: "text-violet-500",     bg: "bg-violet-500/10" },
  first_contact:{ label: "1º Contato",      icon: UserPlus,    color: "text-sky-500",        bg: "bg-sky-500/10" },
  call:         { label: "Ligação",         icon: PhoneCall,   color: "text-emerald-500",    bg: "bg-emerald-500/10" },
  email:        { label: "E-mail",          icon: Mail,        color: "text-rose-500",       bg: "bg-rose-500/10" },
};

type ViewMode = "lista" | "calendario";
type CalendarMode = "dia" | "sem" | "mes";
type StatusFilter = "todas" | "pendentes" | "concluidas";

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM

function getMiniCalendarDays(month: Date) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const startDay = getDay(start); // 0=Sun
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  eachDayOfInterval({ start, end }).forEach(d => days.push(d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function getWeekDays(date: Date) {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end: addDays(start, 6) });
}

// Parse date strings properly, handling both date-only and timestamptz
function parseLocalDate(dateStr: string): Date {
  // If it's a date-only string (no T), parse as local
  if (dateStr.length === 10 && !dateStr.includes("T")) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

// Extract time from due_date (now timestamptz) or fallback to description markers
function getTaskDateTime(task: TaskWithLead): Date | null {
  // If due_date contains time info (timestamptz from DB), use it directly
  if (task.due_date && task.due_date.includes("T")) {
    const d = new Date(task.due_date);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Fallback: try [DT:ISO_STRING] marker in description
  if (task.description) {
    const dtMatch = task.description.match(/\[DT:([^\]]+)\]/);
    if (dtMatch) {
      let dtStr = dtMatch[1];
      // If no timezone info, assume São Paulo (-03:00)
      if (!dtStr.match(/[Z+-]\d/)) dtStr += "-03:00";
      const d = new Date(dtStr);
      if (!isNaN(d.getTime())) return d;
    }
    
    // Fallback: parse "Horário: DD/MM/YYYY às HH:MM"
    const horarioMatch = task.description.match(/Hor[áa]rio:\s*(\d{2})\/(\d{2})\/(\d{4})[,\s]+(?:às\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (horarioMatch) {
      const [, dd, mm, yyyy, hh, min] = horarioMatch;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    }
  }
  
  if (!task.due_date) return null;
  return parseLocalDate(task.due_date);
}

function parseTaskTime(task: TaskWithLead): number | null {
  const dt = getTaskDateTime(task);
  if (!dt) return null;
  // Use São Paulo timezone for display
  const spHours = Number(dt.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }));
  const spMinutes = Number(dt.toLocaleString("en-US", { minute: "numeric", timeZone: "America/Sao_Paulo" }));
  // If midnight and no explicit time marker, default to 9am
  if (spHours === 0 && spMinutes === 0 && !task.description?.match(/\[DT:|Hor[áa]rio:/)) return 9;
  return spHours + spMinutes / 60;
}

function getTaskColor(task: TaskWithLead): string {
  if (task.status === "done") return "bg-emerald-500/80";
  if (task.due_date) {
    const d = parseLocalDate(task.due_date);
    const taskDateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (taskDateStr < todayStr) return "bg-destructive/80";
  }
  return "bg-primary";
}

export default function Tasks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("calendario");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("dia");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [miniCalMonth, setMiniCalMonth] = useState(new Date());
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newLeadId, setNewLeadId] = useState("");
  const [newTaskType, setNewTaskType] = useState("task");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const timeGridRef = useRef<HTMLDivElement>(null);


  // Fetch all tasks with lead names
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["all_lead_tasks", user?.id],
    queryFn: async () => {
      const { data: taskData, error } = await supabase
        .from("lead_tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const taskArr = (taskData || []) as unknown as TaskWithLead[];
      const leadIds = [...new Set(taskArr.map(t => t.lead_id))];
      if (leadIds.length > 0) {
        const { data: leads } = await supabase.from("leads").select("id, name").in("id", leadIds);
        if (leads) {
          const leadMap = new Map(leads.map(l => [l.id, l.name]));
          taskArr.forEach(t => { t.lead_name = leadMap.get(t.lead_id) || "Lead removido"; });
        }
      }
      return taskArr;
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["leads_for_tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: orgData } = useQuery({
    queryKey: ["my-org-id-tasks"],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).maybeSingle();
      return data?.organization_id || null;
    },
    enabled: !!user,
  });
  const { data: orgMembers = [] } = useOrgMembers(orgData || undefined);

  const toggleStatus = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "done" ? "pending" : "done";
      const { error } = await supabase.from("lead_tasks").update({ status: newStatus } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all_lead_tasks"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all_lead_tasks"] }); toast.success("Tarefa removida"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateTaskDescription = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const { error } = await supabase.from("lead_tasks").update({ description } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all_lead_tasks"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !newTitle.trim() || !newLeadId) throw new Error("Preencha todos os campos");
      const { error } = await supabase.from("lead_tasks").insert({
        lead_id: newLeadId, user_id: user.id, title: newTitle.trim(),
        description: newDescription.trim(), due_date: newDueDate || null, status: "pending",
        task_type: newTaskType,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_lead_tasks"] });
      toast.success("Tarefa criada");
      setNewTaskOpen(false); setNewTitle(""); setNewDescription(""); setNewDueDate(""); setNewLeadId(""); setNewTaskType("task");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Filter tasks
  const filtered = useMemo(() => {
    let result = tasks;
    if (statusFilter === "pendentes") result = result.filter(t => t.status === "pending");
    if (statusFilter === "concluidas") result = result.filter(t => t.status === "done");
    if (assignedFilter !== "all") result = result.filter(t => t.assigned_to === assignedFilter);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(term) || (t.lead_name || "").toLowerCase().includes(term));
    }
    return result;
  }, [tasks, statusFilter, assignedFilter, searchTerm]);

  // Auto-scroll to earliest task or current hour
  useEffect(() => {
    if (viewMode === "calendario" && timeGridRef.current) {
      const visibleDays = calendarMode === "dia" ? [selectedDate] : getWeekDays(selectedDate);
      const visibleTasks = filtered.filter(t => 
        t.due_date && visibleDays.some(d => {
          const taskDt = getTaskDateTime(t);
          if (!taskDt) return false;
          const taskDateStr = taskDt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
          return taskDateStr === format(d, "yyyy-MM-dd");
        })
      );
      
      let scrollToHour: number;
      if (visibleTasks.length > 0) {
        const earliestHour = Math.min(...visibleTasks.map(t => parseTaskTime(t) ?? 9));
        scrollToHour = Math.max(6, earliestHour - 1);
      } else {
        scrollToHour = Math.max(6, new Date().getHours() - 1);
      }
      
      // Grid starts at hour 6, each slot = 60px
      timeGridRef.current.scrollTop = (scrollToHour - 6) * 60;
    }
  }, [viewMode, calendarMode, selectedDate, filtered]);

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    const d = parseLocalDate(dueDate);
    const taskDateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return taskDateStr < todayStr;
  };


  // Get tasks for a specific day — handle timezone-safe comparison
  const getTasksForDay = (day: Date) =>
    filtered.filter(t => {
      const taskDt = getTaskDateTime(t);
      if (!taskDt) return false;
      // Compare using São Paulo timezone date string
      const taskDateStr = taskDt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
      const dayStr = format(day, "yyyy-MM-dd");
      return taskDateStr === dayStr;
    });

  // Navigate
  const goNext = () => {
    if (calendarMode === "dia") setSelectedDate(d => addDays(d, 1));
    else if (calendarMode === "sem") setSelectedDate(d => addWeeks(d, 1));
    else setSelectedDate(d => addMonths(d, 1));
  };
  const goPrev = () => {
    if (calendarMode === "dia") setSelectedDate(d => subDays(d, 1));
    else if (calendarMode === "sem") setSelectedDate(d => subWeeks(d, 1));
    else setSelectedDate(d => subMonths(d, 1));
  };
  const goToday = () => setSelectedDate(new Date());

  const weekDays = getWeekDays(selectedDate);
  const miniDays = getMiniCalendarDays(miniCalMonth);
  const pendingCount = tasks.filter(t => t.status === "pending").length;
  const doneCount = tasks.filter(t => t.status === "done").length;

  const headerTitle = useMemo(() => {
    if (calendarMode === "dia") return format(selectedDate, "d 'De' MMMM 'De' yyyy", { locale: ptBR }).replace(/\b\w/g, c => c.toUpperCase());
    if (calendarMode === "sem") {
      const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const end = addDays(start, 6);
      return `${format(start, "d")} - ${format(end, "d 'De' MMMM 'De' yyyy", { locale: ptBR })}`.replace(/\b\w/g, c => c.toUpperCase());
    }
    return format(selectedDate, "MMMM 'De' yyyy", { locale: ptBR }).replace(/\b\w/g, c => c.toUpperCase());
  }, [selectedDate, calendarMode]);

  // Current time indicator
  const now = new Date();
  const currentHourFraction = now.getHours() + now.getMinutes() / 60;

  return (
    <PageTransition>
      <div className="flex flex-col h-[calc(100vh-4rem)] w-full">
        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between px-1 py-3">
          <div className="flex items-center gap-2">
            {(["todas", "pendentes", "concluidas"] as StatusFilter[]).map(f => (
              <Button
                key={f}
                size="sm"
                variant={statusFilter === f ? "default" : "outline"}
                onClick={() => setStatusFilter(f)}
                className={`h-8 px-4 text-[12px] rounded-full font-semibold ${
                  statusFilter === f
                    ? "bg-accent text-accent-foreground hover:bg-accent/90 border-0"
                    : "border-border/20 text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "todas" ? "Todas" : f === "pendentes" ? "Pendentes" : "Concluídas"}
              </Button>
            ))}
            <Button variant="outline" size="sm" className="h-8 px-3 text-[12px] rounded-full border-border/20 text-muted-foreground gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Todas as datas
            </Button>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="h-8 text-[12px] w-auto min-w-[100px] border-border/20 rounded-full gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {orgMembers.map(m => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || m.user_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 bg-muted/30 rounded-full p-0.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setViewMode("lista")}
              className={`h-7 px-3 text-[12px] rounded-full gap-1.5 ${viewMode === "lista" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setViewMode("calendario")}
              className={`h-7 px-3 text-[12px] rounded-full gap-1.5 ${viewMode === "calendario" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              <Calendar className="h-3.5 w-3.5" /> Calendário
            </Button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex min-h-0">
          {viewMode === "calendario" ? (
            <>
              {/* Sidebar */}
              <div className="w-56 shrink-0 border-r border-border/10 flex flex-col gap-4 pr-4 pt-2">
                <Button
                  className="h-10 text-sm gap-2 rounded-2xl font-semibold w-fit px-5 btn-accent"
                  onClick={() => setNewTaskOpen(true)}
                >
                  <Plus className="h-4 w-4" /> Criar
                </Button>

                {/* Mini calendar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setMiniCalMonth(m => subMonths(m, 1))} className="p-1 hover:bg-muted/30 rounded-md transition-colors">
                      <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <span className="text-[12px] font-semibold text-foreground">
                      {format(miniCalMonth, "MMMM yyyy", { locale: ptBR }).replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <button onClick={() => setMiniCalMonth(m => addMonths(m, 1))} className="p-1 hover:bg-muted/30 rounded-md transition-colors">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-0">
                    {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map(d => (
                      <div key={d} className="text-[10px] text-muted-foreground/50 text-center py-1 font-medium">{d}</div>
                    ))}
                    {miniDays.map((day, i) => {
                      if (!day) return <div key={`e${i}`} />;
                      const selected = isSameDay(day, selectedDate);
                      const today = isToday(day);
                      const inMonth = isSameMonth(day, miniCalMonth);
                      const hasTasks = filtered.some(t => t.due_date && isSameDay(parseLocalDate(t.due_date), day));
                      return (
                        <button
                          key={i}
                          onClick={() => { setSelectedDate(day); setCalendarMode("dia"); }}
                          className={`h-7 w-7 mx-auto text-[11px] rounded-full flex items-center justify-center transition-all relative ${
                            selected
                              ? "bg-primary text-primary-foreground font-bold"
                              : today
                              ? "bg-primary/20 text-primary font-bold"
                              : inMonth
                              ? "text-foreground hover:bg-muted/30"
                              : "text-muted-foreground/25"
                          }`}
                        >
                          {day.getDate()}
                          {hasTasks && !selected && (
                            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Calendar main area */}
              <div className="flex-1 flex flex-col min-w-0 pl-4">
                {/* Calendar header */}
                <div className="shrink-0 flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={goToday} className="h-8 px-4 text-[12px] rounded-full border-border/20 font-semibold">
                      Hoje
                    </Button>
                    <button onClick={goPrev} className="p-1.5 hover:bg-muted/30 rounded-lg transition-colors">
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button onClick={goNext} className="p-1.5 hover:bg-muted/30 rounded-lg transition-colors">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <h2 className="text-[15px] font-semibold text-foreground ml-1">{headerTitle}</h2>
                  </div>
                  <div className="flex items-center gap-1 bg-muted/30 rounded-full p-0.5">
                    {(["dia", "sem", "mes"] as CalendarMode[]).map(m => (
                      <Button
                        key={m}
                        size="sm"
                        variant="ghost"
                        onClick={() => setCalendarMode(m)}
                        className={`h-7 px-3 text-[12px] rounded-full capitalize ${calendarMode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
                      >
                        {m === "dia" ? "Dia" : m === "sem" ? "Sem" : "Mês"}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Calendar grid */}
                {calendarMode === "mes" ? (
                  <MonthGrid
                    selectedDate={selectedDate}
                    tasks={filtered}
                    onSelectDay={(d) => { setSelectedDate(d); setCalendarMode("dia"); }}
                  />
                ) : (
                  <DayWeekGrid
                    mode={calendarMode}
                    selectedDate={selectedDate}
                    tasks={filtered}
                    currentHourFraction={currentHourFraction}
                    timeGridRef={timeGridRef}
                    onToggle={(id, status) => toggleStatus.mutate({ id, currentStatus: status })}
                  />
                )}
              </div>
            </>
          ) : (
            /* LIST VIEW */
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-4">
                  <h1 className="text-[1.5rem] font-bold text-foreground tracking-tight">Tarefas</h1>
                  <div className="flex items-center gap-3 text-[12px] text-muted-foreground/50">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {pendingCount} pendentes</span>
                    <span className="flex items-center gap-1"><CircleCheck className="h-3.5 w-3.5" /> {doneCount} concluídas</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/35" />
                    <Input
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-9 bg-transparent border-border/20 h-8 text-[13px] rounded-full w-56 placeholder:text-muted-foreground/30"
                    />
                  </div>
                  <Button
                    className="h-9 text-sm gap-2 rounded-2xl bg-[hsl(var(--chart-2))] text-foreground hover:bg-[hsl(var(--chart-2))]/90 font-semibold shadow-none px-5"
                    onClick={() => setNewTaskOpen(true)}
                  >
                    <Plus className="h-4 w-4" /> Nova tarefa
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto rounded-2xl border border-border/10 bg-card">
                {isLoading ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground/40 text-sm">Carregando...</div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <ListTodo className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.2} />
                    <p className="text-sm text-muted-foreground/40">Nenhuma tarefa encontrada</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/8">
                    {filtered.map((task, i) => {
                      const overdue = task.status === "pending" && isOverdue(task.due_date);
                      const isExpanded = expandedTaskId === task.id;
                      return (
                        <div key={task.id} className="group">
                          <div className="flex items-center gap-4 px-5 py-3 hover:bg-muted/5 transition-colors">
                            <button onClick={() => toggleStatus.mutate({ id: task.id, currentStatus: task.status })}>
                              {task.status === "done" ? (
                                <CircleCheck className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/25 hover:border-primary transition-colors" />
                              )}
                            </button>
                            <button
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                              className={`text-[13px] font-medium truncate text-left flex-1 ${task.status === "done" ? "line-through text-muted-foreground/40" : "text-foreground"}`}
                            >
                              {task.title}
                            </button>
                            {(() => {
                              const cfg = TASK_TYPE_CONFIG[task.task_type || "task"] || TASK_TYPE_CONFIG.task;
                              const Icon = cfg.icon;
                              return (
                                <span className={`text-[11px] font-medium truncate flex items-center gap-1 px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} w-28`}>
                                  <Icon className="h-3 w-3 shrink-0" /> {cfg.label}
                                </span>
                              );
                            })()}
                            <span className="text-[12px] text-muted-foreground/50 truncate flex items-center gap-1.5 w-36">
                              <User2 className="h-3 w-3 shrink-0" /> {task.lead_name || "—"}
                            </span>
                            <span className={`text-[12px] truncate flex items-center gap-1 w-28 ${overdue ? "text-destructive font-medium" : "text-muted-foreground/50"}`}>
                              {task.due_date ? (<><CalendarDays className="h-3 w-3 shrink-0" />{parseLocalDate(task.due_date).toLocaleDateString("pt-BR")}</>) : "—"}
                            </span>
                            <Badge variant="outline" className={`text-[10px] font-medium border-0 ${
                              task.status === "done" ? "bg-emerald-500/10 text-emerald-600" : overdue ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"
                            }`}>
                              {task.status === "done" ? "Concluída" : overdue ? "Atrasada" : "Pendente"}
                            </Badge>
                            <button onClick={() => deleteTask.mutate(task.id)} className="p-1 text-muted-foreground/20 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                                <div className="px-5 pb-3 pl-14">
                                  <Textarea
                                    defaultValue={task.description || ""}
                                    onBlur={e => updateTaskDescription.mutate({ id: task.id, description: e.target.value })}
                                    placeholder="Adicionar comentário..."
                                    className="bg-muted/10 border-border/20 text-[13px] min-h-[60px] resize-none"
                                    rows={2}
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Task Dialog */}
      <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-primary/70 font-medium">Lead</Label>
              <Select value={newLeadId} onValueChange={setNewLeadId}>
                <SelectTrigger className="h-9 text-[13px] bg-muted/10 border-border/20"><SelectValue placeholder="Selecione o lead" /></SelectTrigger>
                <SelectContent>{leads.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-primary/70 font-medium">Tipo de atividade</Label>
              <Select value={newTaskType} onValueChange={setNewTaskType}>
                <SelectTrigger className="h-9 text-[13px] bg-muted/10 border-border/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPE_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className={`flex items-center gap-2 ${cfg.color}`}>
                          <Icon className="h-3.5 w-3.5" /> {cfg.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-primary/70 font-medium">Título</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Enviar proposta comercial" className="h-9 text-[13px] bg-muted/10 border-border/20" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-primary/70 font-medium">Comentário</Label>
              <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Adicionar comentário..." className="text-[13px] bg-muted/10 border-border/20 min-h-[60px] resize-none" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-primary/70 font-medium">Data de vencimento</Label>
              <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="h-9 text-[13px] bg-muted/10 border-border/20" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setNewTaskOpen(false)} className="h-9 text-[13px] rounded-xl border-border/20">Cancelar</Button>
            <Button onClick={() => createTask.mutate()} disabled={!newTitle.trim() || !newLeadId} className="h-9 text-[13px] rounded-xl bg-primary text-primary-foreground">Criar tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}

/* ========= DAY / WEEK TIME GRID ========= */
function DayWeekGrid({
  mode, selectedDate, tasks, currentHourFraction, timeGridRef, onToggle,
}: {
  mode: "dia" | "sem";
  selectedDate: Date;
  tasks: TaskWithLead[];
  currentHourFraction: number;
  timeGridRef: React.RefObject<HTMLDivElement>;
  onToggle: (id: string, status: string) => void;
}) {
  const days = mode === "dia" ? [selectedDate] : getWeekDays(selectedDate);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Day headers */}
      <div className="shrink-0 flex border-b border-border/10">
        <div className="w-16 shrink-0" /> {/* gutter */}
        {days.map(day => (
          <div key={day.toISOString()} className="flex-1 text-center py-2 border-l border-border/5 first:border-l-0">
            <div className="text-[10px] uppercase text-muted-foreground/50 tracking-wide">
              {format(day, "EEEE", { locale: ptBR }).replace(/\b\w/, c => c.toUpperCase()).slice(0, 5)}
            </div>
            <div className={`text-[20px] font-bold mx-auto mt-0.5 w-10 h-10 flex items-center justify-center rounded-full ${
              isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
            }`}>
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div ref={timeGridRef} className="flex-1 overflow-auto relative">
        <div className="flex min-h-[1080px]">
          {/* Time gutter */}
          <div className="w-16 shrink-0 relative">
            {HOURS.map(h => (
              <div key={h} className="h-[60px] relative">
                <span className="absolute -top-2 right-3 text-[10px] text-muted-foreground/40 font-medium tabular-nums">
                  {h <= 11 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => {
            const dayTasks = tasks.filter(t => t.due_date && isSameDay(parseLocalDate(t.due_date), day));
            const showNowLine = isToday(day) && currentHourFraction >= 6 && currentHourFraction <= 23;
            const nowTop = (currentHourFraction - 6) * 60;

            return (
              <div key={day.toISOString()} className="flex-1 relative border-l border-border/5 first:border-l-0">
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div key={h} className="h-[60px] border-b border-border/5" />
                ))}

                {/* Now indicator */}
                {showNowLine && (
                  <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${nowTop}px` }}>
                    <div className="flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-destructive -ml-1.5 shrink-0" />
                      <div className="flex-1 h-[2px] bg-destructive" />
                    </div>
                  </div>
                )}

                {/* Task blocks */}
                {dayTasks.map(task => {
                  const hour = parseTaskTime(task) ?? 9;
                  const clampedHour = Math.max(6, Math.min(22, hour));
                  const top = (clampedHour - 6) * 60;
                  return (
                    <div
                      key={task.id}
                      className={`absolute left-1 right-1 rounded-lg px-2.5 py-1.5 cursor-pointer z-10 ${getTaskColor(task)} hover:brightness-110 transition-all`}
                      style={{ top: `${top}px`, minHeight: "40px" }}
                      onClick={() => onToggle(task.id, task.status)}
                    >
                      <p className="text-[12px] font-semibold text-white truncate">{task.title}</p>
                      <p className="text-[10px] text-white/70 flex items-center gap-1">
                        {(() => {
                          const cfg = TASK_TYPE_CONFIG[task.task_type || "task"] || TASK_TYPE_CONFIG.task;
                          const Icon = cfg.icon;
                          return <><Icon className="h-2.5 w-2.5" /> {cfg.label} · </>;
                        })()}
                        {task.lead_name}
                        {task.due_date && ` · ${format(getTaskDateTime(task) || parseLocalDate(task.due_date), "HH:mm")}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ========= MONTH GRID ========= */
function MonthGrid({
  selectedDate, tasks, onSelectDay,
}: {
  selectedDate: Date;
  tasks: TaskWithLead[];
  onSelectDay: (d: Date) => void;
}) {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const startDay = getDay(monthStart);
  const allDays: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) allDays.push(null);
  eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(d => allDays.push(d));
  while (allDays.length % 7 !== 0) allDays.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      <div className="grid grid-cols-7 border-b border-border/10">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
          <div key={d} className="text-[11px] text-muted-foreground/50 text-center py-2 font-medium">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {allDays.map((day, i) => {
          if (!day) return <div key={`e${i}`} className="border-b border-r border-border/5 min-h-[80px]" />;
          const dayTasks = tasks.filter(t => t.due_date && isSameDay(parseLocalDate(t.due_date), day));
          const today = isToday(day);
          return (
            <button
              key={i}
              onClick={() => onSelectDay(day)}
              className="border-b border-r border-border/5 min-h-[80px] p-1.5 text-left hover:bg-muted/5 transition-colors"
            >
              <span className={`text-[12px] inline-flex items-center justify-center w-6 h-6 rounded-full ${
                today ? "bg-primary text-primary-foreground font-bold" : "text-foreground"
              }`}>
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <div key={t.id} className={`text-[10px] text-white px-1.5 py-0.5 rounded truncate ${getTaskColor(t)}`}>
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[9px] text-muted-foreground/50">+{dayTasks.length - 3} mais</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
