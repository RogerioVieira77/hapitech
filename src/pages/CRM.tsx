import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Plus, Trash2, Loader2, Users, ChevronLeft, ChevronRight, CirclePlus,
  StickyNote, DollarSign, Pencil, Check, X, MoreHorizontal, Layers,
  ChevronDown, GripVertical, Search, Filter, ArrowUpDown, Settings,
  BarChart3, ArrowLeft, Download, Phone, Mail, Building2, ListFilter,
  LayoutGrid, List, Zap, Clock,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { exportCsv } from "@/lib/export-csv";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageTransition } from "@/components/PageTransition";
import { useLeads, Lead, LeadInsert } from "@/hooks/useLeads";
import CrmAutomationView from "@/components/CrmAutomationView";
import { useCrmStages, useCrmPipelines, CrmStage } from "@/hooks/useCrmStages";
import { useCrmCustomFields } from "@/hooks/useCrmCustomFields";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from "recharts";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(value);
}

function formatCurrencyShort(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return `R$ ${value.toFixed(0)}`;
}

/* ====== VIEW: KANBAN ====== */
const STAGE_COLORS_HEX = [
  "#0A66FF", "#00A871", "#F59E0B", "#7C3AED",
  "#EF4444", "#0891B2", "#F97316", "#EC4899", "#14B8A6",
];

const PRIORITY_COLORS: Record<string, string> = {
  alta: "#ef4444",
  media: "#f59e0b",
  baixa: "#22c55e",
};

const PRIORITY_LABELS: Record<string, string> = {
  alta: "QUENTE",
  media: "MORNO",
  baixa: "FRIO",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  site: "Site",
  indicacao: "Indicação",
  "": "",
};

const SOURCE_BADGE_COLORS: Record<string, string> = {
  manual: "#6366f1",
  whatsapp: "#22c55e",
  site: "#3b82f6",
  indicacao: "#8b5cf6",
};

function LeadCard({
  lead, onDelete, onMoveLeft, onMoveRight, stageIndex, totalStages, customFields, fieldValues,
  provided, isDragging, onOpenDetail, stageName, profilePicUrl, contactPhotos,
}: {
  lead: Lead; onDelete: () => void; onMoveLeft: () => void; onMoveRight: () => void;
  stageIndex: number; totalStages: number;
  customFields: any[]; fieldValues: any[];
  provided?: any; isDragging?: boolean;
  onOpenDetail?: () => void;
  stageName?: string;
  profilePicUrl?: string | null;
  contactPhotos?: { name: string; url: string | null; role?: string; phone?: string | null }[];
}) {
  const priorityColor = PRIORITY_COLORS[lead.priority || "media"] || PRIORITY_COLORS.media;
  const hasValue = (lead.value || 0) > 0;
  const sourceLabel = SOURCE_LABELS[lead.source || ""] || lead.source || "";
  const initial = lead.name.charAt(0)?.toUpperCase() || "?";

  // Build avatars: lead main + linked contacts
  const allAvatars: { name: string; url: string | null; role?: string }[] = [];
  allAvatars.push({ name: lead.name, url: profilePicUrl || null, role: "Principal" });
  if (contactPhotos) {
    contactPhotos.forEach(c => {
      if (!allAvatars.some(a => a.name === c.name)) allAvatars.push(c);
    });
  }
  const visibleAvatars = allAvatars.slice(0, 4);
  const extraCount = allAvatars.length - visibleAvatars.length;

  const leadCode = lead.id.slice(0, 8).toUpperCase();
  const createdDate = new Date(lead.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const priorityLabel = PRIORITY_LABELS[lead.priority || ""] || "";
  const priorityBgColor = PRIORITY_COLORS[lead.priority || "media"] || PRIORITY_COLORS.media;
  const sourceBadgeColor = SOURCE_BADGE_COLORS[lead.source || ""] || "#64748b";

  // Check if "Atrasado" - lead older than 7 days without update
  const daysSinceUpdate = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400000);
  const isOverdue = daysSinceUpdate > 7;

  return (
    <div
      ref={provided?.innerRef}
      {...(provided?.draggableProps || {})}
      {...(provided?.dragHandleProps || {})}
      className={`group ${isDragging ? "z-50" : ""}`}
    >
      <motion.div
        onClick={onOpenDetail}
        layout
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`relative bg-card rounded-2xl cursor-pointer select-none overflow-hidden border ${
          isDragging
            ? "border-accent/35 shadow-[0_18px_44px_-12px_hsl(220_35%_15%/0.35)] ring-1 ring-accent/20"
            : "border-border/20 shadow-[0_2px_8px_-3px_hsl(220_30%_10%/0.12)] hover:shadow-[0_10px_30px_-12px_hsl(220_40%_15%/0.25)] hover:border-accent/20"
        } transition-all duration-200`}
      >
        {/* Priority indicator line */}
        <div className="h-[3px] w-full rounded-t-2xl" style={{ backgroundColor: priorityBgColor }} />

        <div className="px-3 pt-2.5 pb-3 space-y-2.5">
          {/* Header: Code */}
          <span className="text-[10px] font-semibold text-muted-foreground/80 tracking-wide font-mono">{leadCode}</span>

          {/* Main row: Avatar + Name + Value */}
          <div className="flex items-start gap-2">
            {profilePicUrl ? (
              <img src={profilePicUrl} alt={lead.name} className="h-8 w-8 rounded-lg object-cover flex-shrink-0 border border-border/10" />
            ) : (
              <span className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-bold text-primary/70 flex-shrink-0 border border-border/10">
                {initial}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-foreground leading-tight truncate">{lead.name}</p>
              <p className="text-[12px] font-bold tabular-nums text-foreground/80 mt-0.5">
                {hasValue ? formatCurrency(lead.value || 0) : <span className="text-muted-foreground/55">R$ –</span>}
              </p>
            </div>
          </div>

          {/* Badges: Source + Priority */}
          {(sourceLabel || priorityLabel) && (
            <div className="flex items-center gap-1 flex-wrap">
              {sourceLabel && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-[3px] text-white leading-none"
                  style={{ backgroundColor: sourceBadgeColor }}
                >
                  {sourceLabel}
                </span>
              )}
              {priorityLabel && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-[3px] text-white leading-none"
                  style={{ backgroundColor: priorityBgColor }}
                >
                  {priorityLabel}
                </span>
              )}
            </div>
          )}

          {/* Footer: contacts + date + overdue */}
          <div className="flex items-center justify-between pt-0.5 border-t border-border/5">
            {/* Contacts */}
            <div className="flex items-center gap-1.5">
              {allAvatars.length > 1 ? (
                <>
                  <div className="flex -space-x-1.5">
                    {visibleAvatars.slice(0, 3).map((a, i) =>
                      a.url ? (
                        <img key={i} src={a.url} alt={a.name} className="h-5 w-5 rounded-full object-cover border-[1.5px] border-card" title={a.name} />
                      ) : (
                        <span key={i} className="h-5 w-5 rounded-full flex items-center justify-center bg-muted/20 text-[7px] font-bold text-muted-foreground/50 border-[1.5px] border-card" title={a.name}>
                          {a.name.charAt(0)?.toUpperCase()}
                        </span>
                      )
                    )}
                    {extraCount > 0 && (
                      <span className="h-5 w-5 rounded-full flex items-center justify-center bg-muted/20 text-[7px] font-bold text-muted-foreground/75 border-[1.5px] border-card">+{extraCount}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 font-medium">{allAvatars.length}</span>
                </>
              ) : (
                <div className="flex items-center gap-1 text-muted-foreground/65">
                  <Users className="h-3 w-3" />
                  <span className="text-[10px] font-medium">1</span>
                </div>
              )}
            </div>

            {/* Date + Overdue */}
            <div className="flex items-center gap-2">
              {isOverdue && (
                <div className="flex items-center gap-1 text-destructive/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive/70 animate-pulse" />
                  <span className="text-[9px] font-semibold">Atrasado</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-muted-foreground/70">
                <Clock className="h-2.5 w-2.5" />
                <span className="text-[10px] font-medium tabular-nums">{createdDate}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ColumnHeader({
  stage, leadsCount, total, onAddLead, onRename, onDelete, onMoveLeft, onMoveRight, isFirst, isLast, stageIndex,
}: {
  stage: CrmStage; leadsCount: number; total: number; onAddLead: () => void;
  onRename: (name: string) => void; onDelete: () => void;
  onMoveLeft: () => void; onMoveRight: () => void; isFirst: boolean; isLast: boolean;
  stageIndex?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);
  const handleSave = () => { if (editName.trim() && editName.trim() !== stage.name) onRename(editName.trim()); setIsEditing(false); };
  const accent = STAGE_COLORS_HEX[(stageIndex ?? 0) % STAGE_COLORS_HEX.length];

  return (
    <div className="mb-2.5 px-1">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setIsEditing(false); }} className="h-7 text-xs font-bold w-28 bg-card border-border/20 rounded-lg px-2" autoFocus />
              <button onClick={handleSave} className="text-accent hover:text-accent/80 p-0.5"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setIsEditing(false); setEditName(stage.name); }} className="text-muted-foreground/50 hover:text-foreground p-0.5"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
              <h3 className="text-[13px] font-bold text-foreground tracking-tight truncate">{stage.name}</h3>
              <span className="text-[11px] font-semibold text-muted-foreground/75 tabular-nums">{leadsCount}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0 shrink-0">
          <button onClick={onAddLead} className="text-muted-foreground/70 hover:text-accent transition-colors p-1 rounded-lg hover:bg-accent/8"><Plus className="h-3.5 w-3.5" strokeWidth={2} /></button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="text-muted-foreground/70 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/20"><MoreHorizontal className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border/15 min-w-[140px]">
              <DropdownMenuItem onClick={() => { setEditName(stage.name); setIsEditing(true); }} className="text-xs gap-2"><Pencil className="h-3 w-3" /> Renomear</DropdownMenuItem>
              {!isFirst && <DropdownMenuItem onClick={onMoveLeft} className="text-xs gap-2"><ChevronLeft className="h-3 w-3" /> Mover à esquerda</DropdownMenuItem>}
              {!isLast && <DropdownMenuItem onClick={onMoveRight} className="text-xs gap-2"><ChevronRight className="h-3 w-3" /> Mover à direita</DropdownMenuItem>}
              <DropdownMenuSeparator className="bg-border/10" />
              <DropdownMenuItem onClick={onDelete} className="text-xs gap-2 text-destructive focus:text-destructive"><Trash2 className="h-3 w-3" /> Remover</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Stats */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80 tabular-nums pl-3">
        <span className="font-semibold">{formatCurrencyShort(total)}</span>
      </div>
    </div>
  );
}

/* ====== VIEW: CONFIGURAR ====== */
function CrmConfigView({
  pipelineId, stages, onBack, renameStage, deleteStage, addStage, reorderStages,
}: {
  pipelineId: string | null; stages: CrmStage[]; onBack: () => void;
  renameStage: (p: { id: string; name: string }) => void; deleteStage: (id: string) => void;
  addStage: (name: string) => void; reorderStages: (ids: string[]) => void;
}) {
  const { fields, addField, updateField, deleteField } = useCrmCustomFields(pipelineId);
  const [newStageName, setNewStageName] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [wonStage, setWonStage] = useState("");
  const [lostStage, setLostStage] = useState("");

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary/40">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold">Configurar</h1>
        </div>
        <Button onClick={onBack} className="rounded-xl h-9 text-xs btn-accent">Voltar</Button>
      </div>

      {/* Status editing */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold">Edição dos status</h2>
        <div className="flex flex-wrap items-center gap-2">
          {stages.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 bg-card text-xs font-medium">
              <GripVertical className="h-3 w-3 text-muted-foreground/30" />
              <span className="truncate max-w-[80px]">{s.name}</span>
              <button onClick={() => deleteStage(s.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <Input value={newStageName} onChange={e => setNewStageName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newStageName.trim()) { addStage(newStageName.trim()); setNewStageName(""); } }} placeholder="Nova fase..." className="h-8 w-32 text-xs bg-background/50 border-border/30" />
            <button onClick={() => { if (newStageName.trim()) { addStage(newStageName.trim()); setNewStageName(""); } }} className="text-primary p-1"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* Special fields */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold">Campos especiais</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status de ganho</Label>
            <Select value={wonStage} onValueChange={setWonStage}>
              <SelectTrigger className="h-9 text-xs bg-background/50 border-border/30"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.slug}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status de perdido</Label>
            <Select value={lostStage} onValueChange={setLostStage}>
              <SelectTrigger className="h-9 text-xs bg-background/50 border-border/30"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.slug}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Custom fields */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold">Campos</h2>
        {fields.map(f => (
          <div key={f.id} className="flex flex-col gap-3 p-4 rounded-xl bg-muted/20 border border-border/15">
            <div className="flex items-start gap-3">
              <GripVertical className="h-4 w-4 text-muted-foreground/30 mt-2 shrink-0" />
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/60">* Nome</Label>
                  <Input value={f.name} onChange={e => updateField.mutate({ id: f.id, name: e.target.value })} className="h-8 text-xs bg-card border-border/20" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/60">* Tipo</Label>
                  <Select value={f.field_type} onValueChange={v => updateField.mutate({ id: f.id, field_type: v })}>
                    <SelectTrigger className="h-8 text-xs bg-card border-border/20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="name">Nome</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="date">Data</SelectItem>
                      <SelectItem value="select">Seleção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(f.field_type === "text" || f.field_type === "select") && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/60">Opções de valor</Label>
                    <div className="flex flex-wrap gap-1">
                      {(f.options || []).map((opt: string, i: number) => (
                        <span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-card border border-border/20 text-[10px]">
                          {opt}
                          <button onClick={() => updateField.mutate({ id: f.id, options: f.options.filter((_: any, j: number) => j !== i) as any })} className="text-muted-foreground/60 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => deleteField.mutate(f.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors p-1 mt-1"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex items-center gap-6 pl-7">
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                <Switch checked={f.show_on_board} onCheckedChange={v => updateField.mutate({ id: f.id, show_on_board: v })} className="scale-75" />
                Mostrar no quadro
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                <Switch checked={f.show_on_list} onCheckedChange={v => updateField.mutate({ id: f.id, show_on_list: v })} className="scale-75" />
                Mostrar na lista
              </label>
            </div>
          </div>
        ))}

        {/* Add new field */}
        <div className="flex justify-center pt-2">
          <button
            onClick={() => addField.mutate({ name: "Novo campo", field_type: "text" })}
            className="flex items-center justify-center gap-1 w-16 h-10 rounded-xl border border-dashed border-border/30 text-muted-foreground/60 hover:text-muted-foreground/60 hover:border-border/50 transition-all"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====== VIEW: RELATÓRIO ====== */
function CrmReportView({
  leads, stages, onBack,
}: {
  leads: Lead[]; stages: CrmStage[]; onBack: () => void;
}) {
  const COLORS = ["hsl(45,90%,55%)", "hsl(170,60%,45%)", "hsl(220,70%,55%)", "hsl(340,65%,55%)", "hsl(25,85%,55%)", "hsl(280,60%,55%)", "hsl(80,60%,50%)", "hsl(0,70%,55%)", "hsl(120,50%,45%)"];

  const stageData = stages.map((s, i) => {
    const stageLeads = leads.filter(l => l.stage === s.slug);
    const pct = leads.length > 0 ? Math.round((stageLeads.length / leads.length) * 100) : 0;
    return { name: s.name, count: stageLeads.length, pct, color: COLORS[i % COLORS.length] };
  });

  const totalValue = leads.reduce((a, l) => a + (l.value || 0), 0);
  const avgTicket = leads.length > 0 ? totalValue / leads.length : 0;
  const lastLead = leads.length > 0 ? leads.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b) : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary/40">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Relatório</h1>
      </div>

      <div className="rounded-2xl bg-card border border-border/15 overflow-hidden">
        {/* Banner */}
        <div className="px-6 py-3 bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 border-b border-border/10">
          <p className="text-[12px] text-muted-foreground/60 flex items-center gap-2">
            ⚠️ Painel experimental - Estamos fazendo testes e entendendo como podemos melhorar esta funcionalidade
          </p>
        </div>

        {/* Funnel chart */}
        <div className="p-6">
          <div className="rounded-xl bg-muted/30 overflow-hidden">
            {/* Header row */}
            <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${stageData.length}, 1fr)` }}>
              {stageData.map((s, i) => (
                <div key={i} className="p-4 border-r border-border/10 last:border-r-0" style={{ backgroundColor: "hsl(var(--muted) / 0.4)" }}>
                  <p className="text-2xl font-bold text-foreground">{s.count}</p>
                  <p className="text-[11px] font-semibold" style={{ color: s.color }}>{s.name}</p>
                  <p className="text-[11px] text-muted-foreground/50">{s.pct}%</p>
                </div>
              ))}
            </div>
            {/* Visual funnel bars */}
            <div className="h-48 relative px-4 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageData} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.4)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.4)" }} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {stageData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="px-5 py-4 rounded-xl bg-card border border-border/15">
          <p className="text-[11px] text-muted-foreground/50 font-medium">Lead time *</p>
          <p className="text-xl font-bold mt-1">-</p>
        </div>
        <div className="px-5 py-4 rounded-xl bg-card border border-border/15">
          <p className="text-[11px] text-muted-foreground/50 font-medium">Último card criado em</p>
          <p className="text-xl font-bold mt-1">
            {lastLead ? new Date(lastLead.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }) + ", " + new Date(lastLead.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-"}
          </p>
        </div>
        <div className="px-5 py-4 rounded-xl bg-card border border-border/15">
          <p className="text-[11px] text-muted-foreground/50 font-medium">Ticket médio</p>
          <p className="text-xl font-bold mt-1">{formatCurrency(avgTicket)}</p>
        </div>
      </div>
    </div>
  );
}

/* ====== PIPELINE FORM DIALOG ====== */
interface StageRow { id: string; name: string; isNew?: boolean }

function PipelineFormDialog({
  open, onOpenChange, initialName = "", initialStages = [], onSave, title,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; initialName?: string;
  initialStages?: StageRow[]; onSave: (name: string, description: string, stages: StageRow[]) => void; title: string;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<StageRow[]>(initialStages);
  const [newStageName, setNewStageName] = useState("");

  useEffect(() => { if (open) { setName(initialName); setStages(initialStages); setDescription(""); setNewStageName(""); } }, [open]);

  const addStage = () => { const t = newStageName.trim(); if (!t) return; setStages(s => [...s, { id: crypto.randomUUID(), name: t, isNew: true }]); setNewStageName(""); };
  const removeStage = (id: string) => setStages(s => s.filter(st => st.id !== id));
  const renameStage = (id: string, val: string) => setStages(s => s.map(st => st.id === id ? { ...st, name: val } : st));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base">{title}</DialogTitle></DialogHeader>
        <div className="space-y-5 pt-1">
          <div className="space-y-1.5">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do funil" maxLength={100} className="bg-background/50 border-border/40 text-sm" autoFocus />
            <p className="text-[10px] text-muted-foreground/50 text-right">{name.length}/100</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição opcional..." rows={3} maxLength={500} className="bg-background/50 border-border/40 resize-none text-sm" />
            <span className="text-[10px] text-muted-foreground/60 float-right">{description.length}/500</span>
          </div>
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Fases</Label>
            <div className="space-y-2">
              {stages.map(st => (
                <div key={st.id} className="flex items-center gap-2 rounded-lg border border-border/30 bg-background/40 px-3 py-2">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                  <Input value={st.name} onChange={e => renameStage(st.id, e.target.value)} className="h-7 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 flex-1" />
                  <button onClick={() => removeStage(st.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newStageName} onChange={e => setNewStageName(e.target.value)} onKeyDown={e => e.key === "Enter" && addStage()} placeholder="Nome da fase" className="h-8 text-xs bg-background/50 border-border/30" />
              <Button size="sm" variant="secondary" onClick={addStage} disabled={!newStageName.trim()} className="h-8 px-3 text-xs">+</Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => { if (name.trim()) { onSave(name.trim(), description, stages); onOpenChange(false); } }} disabled={!name.trim()} className="btn-accent">Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ====== MAIN CRM COMPONENT ====== */
export default function CRM() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { leads, isLoading, createLead, deleteLead, moveLeadToStage, updateLead } = useLeads();
  const { pipelines, isLoading: pipelinesLoading, addPipeline, renamePipeline, deletePipeline } = useCrmPipelines();

  // Fetch profile pictures from conversations matching lead phones
  const leadIds = leads.map(l => l.id);
  
  // Fetch all lead_contacts for all leads
  const { data: allLeadContacts = [] } = useQuery({
    queryKey: ["all-lead-contacts", leadIds.join(",")],
    queryFn: async () => {
      if (leadIds.length === 0) return [];
      const { data, error } = await supabase
        .from("lead_contacts")
        .select("*")
        .in("lead_id", leadIds);
      if (error) throw error;
      return (data || []) as unknown as { id: string; lead_id: string; name: string; phone: string | null; email: string | null }[];
    },
    enabled: leadIds.length > 0,
    staleTime: 60000,
  });

  // Collect all phones from leads + lead_contacts for profile pic lookup
  const allPhones = useMemo(() => {
    const phones: string[] = [];
    leads.forEach(l => { if (l.phone) phones.push(l.phone.replace(/\D/g, "")); });
    allLeadContacts.forEach(c => { if (c.phone) phones.push(c.phone.replace(/\D/g, "")); });
    return [...new Set(phones.filter(Boolean))];
  }, [leads, allLeadContacts]);

  const { data: profilePicMap = {} } = useQuery({
    queryKey: ["lead-profile-pics", allPhones.join(",")],
    queryFn: async () => {
      if (allPhones.length === 0) return {};
      const conditions = [...new Set(allPhones.map(p => p.slice(-8)))].map(p => `contact_phone.ilike.%${p}%`);
      const { data } = await supabase
        .from("conversations")
        .select("contact_phone, profile_picture_url, contact_name")
        .or(conditions.join(","))
        .not("profile_picture_url", "is", null);
      const map: Record<string, string> = {};
      (data || []).forEach(c => {
        if (c.profile_picture_url && c.contact_phone) {
          const clean = c.contact_phone.replace(/\D/g, "");
          map[clean] = c.profile_picture_url;
          if (clean.length > 8) map[clean.slice(-8)] = c.profile_picture_url;
        }
      });
      return map;
    },
    enabled: allPhones.length > 0,
    staleTime: 60000,
  });

  const getProfilePic = useCallback((phone: string | null | undefined) => {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, "");
    return profilePicMap[clean] || profilePicMap[clean.slice(-8)] || null;
  }, [profilePicMap]);

  // Build contact photos per lead
  const leadContactPhotos = useMemo(() => {
    const map: Record<string, { name: string; url: string | null; role?: string; phone?: string | null }[]> = {};
    allLeadContacts.forEach(c => {
      if (!map[c.lead_id]) map[c.lead_id] = [];
      map[c.lead_id].push({ name: c.name, url: getProfilePic(c.phone), role: (c as any).role || undefined, phone: c.phone || null });
    });
    return map;
  }, [allLeadContacts, getProfilePic]);

  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const { stages, isLoading: stagesLoading, addStage, renameStage, deleteStage, reorderStages } = useCrmStages(activePipelineId);
  const { fields: customFields, fieldValues, setFieldValue } = useCrmCustomFields(activePipelineId);

  // Views: kanban, config, report, automation
  const [view, setView] = useState<"kanban" | "config" | "report" | "automation">("kanban");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  useEffect(() => {
    if (pipelines.length > 0 && !activePipelineId) setActivePipelineId(pipelines[0].id);
    if (activePipelineId && pipelines.length > 0 && !pipelines.find(p => p.id === activePipelineId)) setActivePipelineId(pipelines[0].id);
  }, [pipelines, activePipelineId]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStage, setDialogStage] = useState<string>("novo");
  const [form, setForm] = useState<LeadInsert>({ name: "" });
  const [customFieldForm, setCustomFieldForm] = useState<Record<string, string>>({});
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [pipelineFormOpen, setPipelineFormOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  type SortColumn = "name" | "stage" | "value" | "phone" | "email" | "company" | "source" | "created_at";
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (col: SortColumn) => {
    if (sortColumn === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortColumn(col); setSortDir("asc"); }
  };
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const handleCreate = useCallback(() => {
    if (!form.name.trim()) return;
    createLead({ ...form, stage: dialogStage });
    setForm({ name: "" });
    setCustomFieldForm({});
    setDialogOpen(false);
  }, [form, dialogStage, createLead]);

  const openAddDialog = (stageSlug: string) => {
    setDialogStage(stageSlug);
    setForm({ name: "" });
    setCustomFieldForm({});
    setDialogOpen(true);
  };

  const handleAddColumn = () => {
    if (!newColumnName.trim()) return;
    addStage(newColumnName.trim());
    setNewColumnName("");
    setAddColumnOpen(false);
  };

  const handleSwapStages = (index: number, direction: -1 | 1) => {
    const newOrder = [...stages];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newOrder.length) return;
    [newOrder[index], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[index]];
    reorderStages(newOrder.map(s => s.id));
  };

  const handleDragEnd = useCallback((result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;
    const destStage = destination.droppableId;
    const lead = leads.find(l => l.id === draggableId);
    if (!lead || lead.stage === destStage) return;
    moveLeadToStage({ id: draggableId, stage: destStage });
  }, [leads, moveLeadToStage]);


  const filteredLeads = useMemo(() => {
    let result = [...leads];
    if (filterStage !== "all") {
      result = result.filter(l => l.stage === filterStage);
    }
    if (filterSource !== "all") {
      result = result.filter(l => (l.source || "manual") === filterSource);
    }
    if (filterPriority !== "all") {
      result = result.filter(l => (l.priority || "media") === filterPriority);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => l.name.toLowerCase().includes(q) || (l.phone || "").includes(q) || (l.email || "").toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "name": cmp = (a.name || "").localeCompare(b.name || ""); break;
        case "stage": cmp = (a.stage || "").localeCompare(b.stage || ""); break;
        case "value": cmp = (a.value || 0) - (b.value || 0); break;
        case "phone": cmp = (a.phone || "").localeCompare(b.phone || ""); break;
        case "email": cmp = (a.email || "").localeCompare(b.email || ""); break;
        case "company": cmp = (a.company || "").localeCompare(b.company || ""); break;
        case "source": cmp = (a.source || "").localeCompare(b.source || ""); break;
        case "created_at": cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [leads, searchQuery, sortColumn, sortDir, filterStage, filterSource, filterPriority]);

  const handleExportExcel = useCallback(() => {
    const stageMap = Object.fromEntries(stages.map(s => [s.slug, s.name]));
    const rows = filteredLeads.map(l => ({
      Nome: l.name,
      "E-mail": l.email || "",
      Telefone: l.phone || "",
      Empresa: l.company || "",
      Valor: l.value || 0,
      Estágio: stageMap[l.stage] || l.stage,
      Fonte: l.source || "",
      Observação: l.notes || "",
      "Criado em": new Date(l.created_at).toLocaleDateString("pt-BR"),
    }));
    exportCsv(rows, `leads-${new Date().toISOString().slice(0, 10)}.csv`);
  }, [filteredLeads, stages]);


  const leadsPerStage = stages.map(s => ({
    ...s,
    leads: filteredLeads.filter(l => l.stage === s.slug),
    total: filteredLeads.filter(l => l.stage === s.slug).reduce((a, l) => a + (l.value || 0), 0),
  }));

  const loading = isLoading || stagesLoading || pipelinesLoading;
  const activePipeline = pipelines.find(p => p.id === activePipelineId);

  // --- RENDER VIEWS ---
  if (view === "config") {
    return (
      <PageTransition>
        <CrmConfigView
          pipelineId={activePipelineId}
          stages={stages}
          onBack={() => setView("kanban")}
          renameStage={renameStage}
          deleteStage={deleteStage}
          addStage={addStage}
          reorderStages={reorderStages}
        />
      </PageTransition>
    );
  }

  if (view === "report") {
    return (
      <PageTransition>
        <CrmReportView leads={leads} stages={stages} onBack={() => setView("kanban")} />
      </PageTransition>
    );
  }

  if (view === "automation") {
    return (
      <PageTransition>
        <CrmAutomationView pipelineId={activePipelineId} stages={stages} onBack={() => setView("kanban")} />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-3">
        {/* Toolbar */}
        <motion.div
          className="flex items-center gap-2.5 flex-wrap rounded-2xl border border-border/20 bg-card/80 backdrop-blur px-3 py-2.5 shadow-[0_8px_28px_-18px_hsl(220_40%_12%/0.35)]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Funil / Lista toggle */}
          <div className="flex items-center rounded-xl bg-background/70 border border-border/20 overflow-hidden shadow-[inset_0_1px_0_hsl(var(--background)/0.75)]">
            <button onClick={() => setViewMode("kanban")} className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold transition-colors ${viewMode === "kanban" ? "text-accent-foreground bg-accent" : "text-muted-foreground/80 hover:text-foreground hover:bg-muted/40"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Funil
            </button>
            <button onClick={() => setViewMode("list")} className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold transition-colors ${viewMode === "list" ? "text-accent-foreground bg-accent" : "text-muted-foreground/80 hover:text-foreground hover:bg-muted/40"}`}>
              <List className="h-3.5 w-3.5" /> Lista
            </button>
          </div>

          {/* Pipeline selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/82 font-medium">Funil</span>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-background/80 border border-border/20 hover:border-accent/25 transition-all text-sm font-semibold text-foreground min-w-[132px] shadow-[0_2px_8px_-6px_hsl(220_30%_12%/0.25)]">
                  {activePipeline?.name || "Funil"}
                  <ChevronDown className="h-3 w-3 text-muted-foreground/75 ml-auto" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1.5 bg-card border-border/30">
                <p className="text-[9px] font-bold text-muted-foreground/78 uppercase tracking-[0.12em] px-2.5 py-1.5">Funis</p>
                {pipelines.map((p) => (
                  <button key={p.id} onClick={() => setActivePipelineId(p.id)} className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] transition-colors ${activePipelineId === p.id ? "bg-accent/12 text-accent font-semibold border border-accent/20" : "text-muted-foreground/90 hover:bg-muted/40 hover:text-foreground"}`}>
                    <span className="truncate">{p.name}</span>
                    {activePipelineId === p.id && <Check className="h-3.5 w-3.5 text-accent shrink-0" />}
                  </button>
                ))}
                <div className="border-t border-border/15 mt-1 pt-1">
                  <button onClick={() => setPipelineFormOpen(true)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground/90 hover:bg-muted/40 hover:text-foreground transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Novo funil
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/82 font-medium">Fonte</span>
            <Popover>
              <PopoverTrigger asChild>
                <button className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all min-w-[110px] ${filterSource !== "all" ? "bg-accent/12 border-accent/30 text-accent" : "bg-background/80 border-border/20 text-muted-foreground/90 hover:text-foreground hover:border-accent/20"}`}>
                  {filterSource === "all" ? "Todos" : SOURCE_LABELS[filterSource] || filterSource}
                  <ChevronDown className="h-3 w-3 text-muted-foreground/75 ml-auto" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-1.5 bg-card border-border/30">
                {[{ key: "all", label: "Todos" }, { key: "manual", label: "Manual" }, { key: "whatsapp", label: "WhatsApp" }, { key: "site", label: "Site" }, { key: "indicacao", label: "Indicação" }].map(opt => (
                  <button key={opt.key} onClick={() => setFilterSource(opt.key)} className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] transition-colors ${filterSource === opt.key ? "bg-accent/12 text-accent font-semibold border border-accent/20" : "text-muted-foreground/90 hover:bg-muted/40 hover:text-foreground"}`}>
                    <span className="flex items-center gap-2">
                      {opt.key !== "all" && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SOURCE_BADGE_COLORS[opt.key] || "#64748b" }} />}
                      {opt.label}
                    </span>
                    {filterSource === opt.key && <Check className="h-3.5 w-3.5 text-accent shrink-0" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Stage filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/82 font-medium">Etapa</span>
            <Popover>
              <PopoverTrigger asChild>
                <button className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all min-w-[110px] ${filterStage !== "all" ? "bg-accent/12 border-accent/30 text-accent" : "bg-background/80 border-border/20 text-muted-foreground/90 hover:text-foreground hover:border-accent/20"}`}>
                  {filterStage === "all" ? "Todas" : stages.find(s => s.slug === filterStage)?.name || filterStage}
                  <ChevronDown className="h-3 w-3 text-muted-foreground/75 ml-auto" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-1.5 bg-card border-border/30">
                <button onClick={() => setFilterStage("all")} className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] transition-colors ${filterStage === "all" ? "bg-accent/12 text-accent font-semibold border border-accent/20" : "text-muted-foreground/90 hover:bg-muted/40 hover:text-foreground"}`}>
                  <span>Todas</span>
                  {filterStage === "all" && <Check className="h-3.5 w-3.5 text-accent shrink-0" />}
                </button>
                {stages.map((s, i) => (
                  <button key={s.id} onClick={() => setFilterStage(s.slug)} className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] transition-colors ${filterStage === s.slug ? "bg-accent/12 text-accent font-semibold border border-accent/20" : "text-muted-foreground/90 hover:bg-muted/40 hover:text-foreground"}`}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS_HEX[i % STAGE_COLORS_HEX.length] }} />
                      {s.name}
                    </span>
                    {filterStage === s.slug && <Check className="h-3.5 w-3.5 text-accent shrink-0" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Priority filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground/82 font-medium">Temperatura</span>
            <Popover>
              <PopoverTrigger asChild>
                <button className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all min-w-[95px] ${filterPriority !== "all" ? "bg-accent/12 border-accent/30 text-accent" : "bg-background/80 border-border/20 text-muted-foreground/90 hover:text-foreground hover:border-accent/20"}`}>
                  {filterPriority === "all" ? "Todas" : PRIORITY_LABELS[filterPriority] || filterPriority}
                  <ChevronDown className="h-3 w-3 text-muted-foreground/75 ml-auto" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-44 p-1.5 bg-card border-border/30">
                {[{ key: "all", label: "Todas" }, { key: "alta", label: "Quente" }, { key: "media", label: "Morno" }, { key: "baixa", label: "Frio" }].map(opt => (
                  <button key={opt.key} onClick={() => setFilterPriority(opt.key)} className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] transition-colors ${filterPriority === opt.key ? "bg-accent/12 text-accent font-semibold border border-accent/20" : "text-muted-foreground/90 hover:bg-muted/40 hover:text-foreground"}`}>
                    <span className="flex items-center gap-2">
                      {opt.key !== "all" && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[opt.key] }} />}
                      {opt.label}
                    </span>
                    {filterPriority === opt.key && <Check className="h-3.5 w-3.5 text-accent shrink-0" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-background/80 border border-border/20 min-w-[170px]">
            <Search className="h-3.5 w-3.5 text-muted-foreground/65" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Pesquisar..."
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none w-full"
            />
          </div>

          {/* Actions */}
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground/90 hover:text-foreground hover:bg-muted/30 transition-all border border-transparent hover:border-border/25">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setView("config")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground/90 hover:text-foreground hover:bg-muted/30 transition-all border border-transparent hover:border-border/25">
            <Settings className="h-3.5 w-3.5" />
          </button>

          {activePipeline && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground/70 hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted/30"><MoreHorizontal className="h-4 w-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border/30 min-w-[160px]">
                <DropdownMenuItem onClick={() => setView("report")} className="text-xs gap-2"><BarChart3 className="h-3 w-3" /> Relatório</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("automation")} className="text-xs gap-2"><Zap className="h-3 w-3" /> Automação</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditingPipeline({ id: activePipeline.id, name: activePipeline.name })} className="text-xs gap-2"><Pencil className="h-3 w-3" /> Editar funil</DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2">Importar</DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2">Arquivados</DropdownMenuItem>
                {pipelines.length > 1 && (<><DropdownMenuSeparator className="bg-border/15" /><DropdownMenuItem onClick={() => deletePipeline(activePipeline.id)} className="text-xs gap-2 text-destructive focus:text-destructive"><Trash2 className="h-3 w-3" /> Excluir funil</DropdownMenuItem></>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </motion.div>

        {/* Kanban Board or List View */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" /></div>
        ) : viewMode === "list" ? (
          /* ====== LIST VIEW ====== */
          <div className="rounded-xl border border-border/10 bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/10">
                    {([
                      ["name", "Nome"],
                      ["stage", "Etapa"],
                      ["value", "Valor"],
                      ["phone", "Telefone"],
                      ["email", "E-mail"],
                      ["company", "Empresa"],
                      ["source", "Fonte"],
                    ] as [SortColumn, string][]).map(([col, label]) => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className="text-[11px] font-semibold text-muted-foreground/78 uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-foreground transition-colors group/th"
                      >
                        <span className="inline-flex items-center gap-1">
                          {label}
                          <ArrowUpDown className={`h-3 w-3 transition-opacity ${sortColumn === col ? "opacity-100 text-foreground" : "opacity-0 group-hover/th:opacity-50"}`} />
                          {sortColumn === col && (
                            <ChevronDown className={`h-3 w-3 text-foreground transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="text-[11px] font-semibold text-muted-foreground/78 uppercase tracking-wider px-4 py-3">Contatos</th>
                    <th
                      onClick={() => toggleSort("created_at")}
                      className="text-[11px] font-semibold text-muted-foreground/78 uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-foreground transition-colors group/th"
                    >
                      <span className="inline-flex items-center gap-1">
                        Criado
                        <ArrowUpDown className={`h-3 w-3 transition-opacity ${sortColumn === "created_at" ? "opacity-100 text-foreground" : "opacity-0 group-hover/th:opacity-50"}`} />
                        {sortColumn === "created_at" && (
                          <ChevronDown className={`h-3 w-3 text-foreground transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />
                        )}
                      </span>
                    </th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map(lead => {
                    const stageObj = stages.find(s => s.slug === lead.stage);
                    const stageIdx = stages.findIndex(s => s.slug === lead.stage);
                    const stageColor = STAGE_COLORS_HEX[stageIdx >= 0 ? stageIdx % STAGE_COLORS_HEX.length : 0];
                    const pic = getProfilePic(lead.phone);
                    const contacts = leadContactPhotos[lead.id] || [];
                    const initial = lead.name.charAt(0)?.toUpperCase() || "?";

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => navigate(`/crm/lead/${lead.id}`)}
                        className="border-b border-border/5 hover:bg-muted/5 cursor-pointer transition-colors group"
                      >
                        {/* Name + avatar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {pic ? (
                              <img src={pic} alt="" className="h-8 w-8 rounded-full object-cover border border-border/15 shrink-0" />
                            ) : (
                              <span className="h-8 w-8 rounded-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 text-[11px] font-bold text-primary/60 shrink-0">{initial}</span>
                            )}
                            <div>
                              <p className="text-[13px] font-semibold text-foreground leading-tight">{lead.name}</p>
                              {lead.priority && (
                                <span className="inline-block h-1.5 w-1.5 rounded-full mt-0.5" style={{ backgroundColor: PRIORITY_COLORS[lead.priority] || PRIORITY_COLORS.media }} />
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Stage */}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ backgroundColor: stageColor + "18", color: stageColor }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stageColor }} />
                            {stageObj?.name || lead.stage}
                          </span>
                        </td>
                        {/* Value */}
                        <td className="px-4 py-3 text-[13px] font-bold tabular-nums text-foreground">
                          {(lead.value || 0) > 0 ? formatCurrency(lead.value || 0) : "-"}
                        </td>
                        {/* Phone */}
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{lead.phone || "-"}</td>
                        {/* Email */}
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{lead.email || "-"}</td>
                        {/* Company */}
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{lead.company || "-"}</td>
                        {/* Source */}
                        <td className="px-4 py-3">
                          {lead.source && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md border border-border/15 text-muted-foreground/80 font-medium bg-muted/10">
                              {SOURCE_LABELS[lead.source] || lead.source}
                            </span>
                          )}
                        </td>
                        {/* Contacts count */}
                        <td className="px-4 py-3">
                          {contacts.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 hover:bg-muted/10 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors">
                                  <div className="flex -space-x-1.5">
                                    {contacts.slice(0, 3).map((c, i) => (
                                      c.url ? (
                                        <img key={i} src={c.url} alt={c.name} className="h-6 w-6 rounded-full object-cover border-2 border-card" />
                                      ) : (
                                        <span key={i} className="h-6 w-6 rounded-full flex items-center justify-center bg-primary/10 text-[9px] font-bold text-primary/60 border-2 border-card">
                                          {c.name.charAt(0)?.toUpperCase()}
                                        </span>
                                      )
                                    ))}
                                  </div>
                                  <span className="text-[11px] text-muted-foreground/60 font-medium">{contacts.length}</span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-56 p-2 rounded-xl bg-popover" sideOffset={6} onClick={e => e.stopPropagation()}>
                                <p className="text-[11px] font-semibold text-muted-foreground/72 uppercase tracking-wider px-2 pb-1.5">Contatos</p>
                                <div className="space-y-0.5">
                                  {contacts.map((c, i) => (
                                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/10">
                                      {c.url ? (
                                        <img src={c.url} alt={c.name} className="h-6 w-6 rounded-full object-cover border border-border/15 shrink-0" />
                                      ) : (
                                        <span className="h-6 w-6 rounded-full flex items-center justify-center bg-primary/10 text-[9px] font-bold text-primary/60 shrink-0">{c.name.charAt(0)?.toUpperCase()}</span>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium text-foreground truncate">{c.name}</p>
                                        <p className="text-[10px] text-muted-foreground/72 truncate">
                                          {[c.role, c.phone].filter(Boolean).join(" · ") || "—"}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </td>
                        {/* Created */}
                        <td className="px-4 py-3 text-[11px] text-muted-foreground/60 tabular-nums">
                          {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                              <button className="opacity-40 group-hover:opacity-100 text-muted-foreground/65 hover:text-foreground transition-all p-1 rounded-lg hover:bg-muted/20" onClick={e => e.stopPropagation()}>
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border/20 min-w-[140px]" onClick={e => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => navigate(`/crm/lead/${lead.id}`)} className="text-xs gap-2"><Pencil className="h-3 w-3" /> Editar</DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-border/10" />
                              <DropdownMenuItem onClick={() => deleteLead(lead.id)} className="text-xs gap-2 text-destructive focus:text-destructive"><Trash2 className="h-3 w-3" /> Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredLeads.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/30">
                  <Users className="h-8 w-8 mb-2" strokeWidth={1} />
                  <p className="text-sm font-medium">Nenhum lead encontrado</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ====== KANBAN VIEW ====== */
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="overflow-x-auto pb-4 -mx-1">
              <div className="min-w-max px-1 py-1">
                <div className="flex gap-3.5">
                {leadsPerStage.map((stage, stageIdx) => {
                  const stageAccent = STAGE_COLORS_HEX[stageIdx % STAGE_COLORS_HEX.length];
                  return (
                    <div key={stage.id} className="w-[268px] md:w-[276px] shrink-0">
                      <div
                        className="relative rounded-2xl border border-border/20 px-2 py-2 shadow-[0_8px_24px_-20px_hsl(220_35%_12%/0.35)]"
                        style={{
                          background: `linear-gradient(180deg, ${stageAccent}16 0%, hsl(var(--muted) / 0.42) 45%, hsl(var(--muted) / 0.3) 100%)`,
                        }}
                      >
                        <span className="pointer-events-none absolute left-8 right-8 top-0 h-[2px] rounded-b-full" style={{ backgroundColor: stageAccent }} />
                        <ColumnHeader
                          stage={stage} leadsCount={stage.leads.length} total={stage.total}
                          onAddLead={() => openAddDialog(stage.slug)}
                          onRename={name => renameStage({ id: stage.id, name })}
                          onDelete={() => deleteStage(stage.id)}
                          onMoveLeft={() => handleSwapStages(stageIdx, -1)}
                          onMoveRight={() => handleSwapStages(stageIdx, 1)}
                          isFirst={stageIdx === 0} isLast={stageIdx === stages.length - 1}
                          stageIndex={stageIdx}
                        />
                        <div className="p-5">
                          <button
                            onClick={() => openAddDialog(stage.slug)}
                            className="mx-auto flex w-1/2 items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-accent/20 text-accent/80 hover:text-accent hover:border-accent/35 hover:bg-accent/5 transition-all text-[11px] font-semibold"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Novo
                          </button>
                        </div>
                        <Droppable droppableId={stage.slug}>
                          {(droppableProvided, snapshot) => (
                            <div
                              ref={droppableProvided.innerRef}
                              {...droppableProvided.droppableProps}
                              className={`space-y-2 min-h-[210px] rounded-xl p-1 transition-all duration-300 ${
                                snapshot.isDraggingOver
                                  ? "bg-accent/[0.06] ring-1 ring-accent/18"
                                  : "bg-background/40"
                              }`}
                            >
                              {stage.leads.map((lead, leadIdx) => (
                                <Draggable key={lead.id} draggableId={lead.id} index={leadIdx}>
                                  {(draggableProvided, draggableSnapshot) => (
                                    <LeadCard
                                      lead={lead} stageIndex={stageIdx} totalStages={stages.length}
                                      customFields={customFields} fieldValues={fieldValues}
                                      provided={draggableProvided} isDragging={draggableSnapshot.isDragging}
                                      onDelete={() => deleteLead(lead.id)}
                                      onMoveLeft={() => { if (stageIdx > 0) moveLeadToStage({ id: lead.id, stage: stages[stageIdx - 1].slug }); }}
                                      onMoveRight={() => { if (stageIdx < stages.length - 1) moveLeadToStage({ id: lead.id, stage: stages[stageIdx + 1].slug }); }}
                                      onOpenDetail={() => navigate(`/crm/lead/${lead.id}`)}
                                      stageName={stage.name}
                                      profilePicUrl={getProfilePic(lead.phone)}
                                      contactPhotos={leadContactPhotos[lead.id] || []}
                                    />
                                  )}
                                </Draggable>
                              ))}
                              {droppableProvided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    </div>
                  );
                })}
                {/* Add column */}
                <div className="w-[268px] md:w-[276px] shrink-0">
                  <button
                    onClick={() => setAddColumnOpen(true)}
                    className="h-full min-h-[320px] w-full rounded-2xl border-2 border-dashed border-border/25 bg-background/50 flex flex-col items-center justify-center gap-2 text-muted-foreground/65 hover:text-accent hover:border-accent/35 hover:bg-accent/5 transition-all duration-300 group"
                  >
                    <Plus className="h-5 w-5" strokeWidth={1.8} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Nova coluna</span>
                  </button>
                </div>
                </div>
              </div>
            </div>
          </DragDropContext>
        )}
      </div>

      {/* New Lead Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo(a) Registro</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Informações gerais */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-muted/20 border border-border/10 hover:bg-muted/30 transition-colors">
                <span className="text-sm font-semibold">Informações gerais</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-4 p-4">
                  {/* Status */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={dialogStage} onValueChange={setDialogStage}>
                      <SelectTrigger className="h-9 text-xs bg-background/50 border-border/40"><SelectValue /></SelectTrigger>
                      <SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.slug}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {/* Name + Priority side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Identificação do Lead</Label>
                      <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome" className="bg-background/50 border-border/40 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Prioridade</Label>
                      <Select value={customFieldForm["prioridade"] || ""} onValueChange={v => setCustomFieldForm(f => ({ ...f, prioridade: v }))}>
                        <SelectTrigger className="h-10 text-xs bg-background/50 border-border/40"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Baixa">Baixa</SelectItem>
                          <SelectItem value="Média">Média</SelectItem>
                          <SelectItem value="Alta">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Contato */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Contato</Label>
                      <Input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Telefone" className="bg-background/50 border-border/40 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">E-mail</Label>
                      <Input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" className="bg-background/50 border-border/40 text-sm" />
                    </div>
                  </div>
                  {/* Custom fields from config */}
                  {customFields.map(cf => (
                    <div key={cf.id} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{cf.name}</Label>
                      {cf.field_type === "select" && cf.options.length > 0 ? (
                        <Select value={customFieldForm[cf.id] || ""} onValueChange={v => setCustomFieldForm(f => ({ ...f, [cf.id]: v }))}>
                          <SelectTrigger className="h-10 text-xs bg-background/50 border-border/40"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                          <SelectContent>{cf.options.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input value={customFieldForm[cf.id] || ""} onChange={e => setCustomFieldForm(f => ({ ...f, [cf.id]: e.target.value }))} className="bg-background/50 border-border/40 text-sm" />
                      )}
                    </div>
                  ))}
                  {/* Observação */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Observação</Label>
                    <Textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observação..." rows={3} className="bg-background/50 border-border/40 resize-none text-sm" />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Valor */}
            <div className="space-y-1.5 px-4">
              <Label className="text-xs text-muted-foreground">Valor</Label>
              <Input type="number" value={form.value || ""} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))} placeholder="0" className="bg-background/50 border-border/40 text-sm" />
            </div>

            <div className="flex justify-end gap-2 pt-2 px-4">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!form.name.trim()} className="btn-accent">+ Registro</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
        <DialogContent className="bg-card border-border/50 max-w-sm">
          <DialogHeader><DialogTitle>Nova coluna</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome da coluna</Label>
              <Input value={newColumnName} onChange={e => setNewColumnName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddColumn()} placeholder="Ex: Qualificado" className="bg-background/50 border-border/40" autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddColumnOpen(false)}>Cancelar</Button>
              <Button onClick={handleAddColumn} disabled={!newColumnName.trim()}>Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PipelineFormDialog open={pipelineFormOpen} onOpenChange={setPipelineFormOpen} title="Criar novo funil" onSave={name => addPipeline(name)} />
      <PipelineFormDialog open={!!editingPipeline} onOpenChange={v => { if (!v) setEditingPipeline(null); }} title="Editar funil" initialName={editingPipeline?.name ?? ""} initialStages={stages.map(s => ({ id: s.id, name: s.name }))} onSave={(name) => { if (editingPipeline) renamePipeline({ id: editingPipeline.id, name }); setEditingPipeline(null); }} />

    </PageTransition>
  );
}
