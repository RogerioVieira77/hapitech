import { useState } from "react";
import { Tag as TagIcon, Plus, X, Check, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTags, Tag } from "@/hooks/useTags";
import { toast } from "sonner";

const TAG_COLORS = [
  // Roxos & Violetas
  "#6366f1", "#8b5cf6", "#a855f7", "#7c3aed", "#6d28d9", "#4f46e5",
  // Rosas & Magentas
  "#d946ef", "#ec4899", "#f472b6", "#db2777", "#be185d",
  // Vermelhos & Laranjas
  "#f43f5e", "#ef4444", "#dc2626", "#f97316", "#ea580c", "#c2410c",
  // Amarelos & Limão
  "#f59e0b", "#eab308", "#ca8a04", "#84cc16", "#65a30d",
  // Verdes
  "#22c55e", "#16a34a", "#15803d", "#10b981", "#059669",
  // Azuis & Cianos
  "#14b8a6", "#0d9488", "#06b6d4", "#0891b2", "#0ea5e9", "#0284c7",
  "#3b82f6", "#2563eb", "#1d4ed8",
  // Neutros & Escuros
  "#64748b", "#475569", "#334155", "#78716c", "#57534e",
  // Extras vibrantes
  "#e11d48", "#9333ea", "#c026d3", "#0369a1", "#047857",
];

/* ── Color Picker Row ── */
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const isCustom = !TAG_COLORS.includes(value);
  const [hexInput, setHexInput] = useState("");
  const [showHex, setShowHex] = useState(false);

  const applyHex = (raw: string) => {
    const hex = raw.startsWith("#") ? raw : `#${raw}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex);
      setShowHex(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1 flex-wrap items-center">
        {TAG_COLORS.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`h-5 w-5 rounded-full transition-all ${value === c ? "ring-2 ring-offset-1 ring-primary" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <label
          className={`h-5 w-5 rounded-full cursor-pointer transition-all border border-dashed border-muted-foreground/40 flex items-center justify-center overflow-hidden ${isCustom ? "ring-2 ring-offset-1 ring-primary" : ""}`}
          style={isCustom ? { backgroundColor: value } : {}}
          title="Cor personalizada"
        >
          {!isCustom && <Plus className="h-3 w-3 text-muted-foreground/60" />}
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="sr-only"
          />
        </label>
        <button
          onClick={() => { setHexInput(value); setShowHex(s => !s); }}
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground ml-1 font-mono"
          title="Digitar código hex"
        >
          HEX
        </button>
      </div>
      {showHex && (
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded-full shrink-0 border border-border/30" style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(hexInput.startsWith("#") ? hexInput : `#${hexInput}`) ? (hexInput.startsWith("#") ? hexInput : `#${hexInput}`) : value }} />
          <Input
            value={hexInput}
            onChange={e => setHexInput(e.target.value.slice(0, 7))}
            onKeyDown={e => e.key === "Enter" && applyHex(hexInput)}
            placeholder="#FF5733"
            className="h-6 text-[11px] font-mono flex-1 px-2"
            maxLength={7}
          />
          <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => applyHex(hexInput)} disabled={!/^#?[0-9A-Fa-f]{6}$/.test(hexInput)}>
            OK
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Inline Edit Form ── */
function TagEditForm({ tag, onSave, onCancel }: { tag: Tag; onSave: (name: string, color: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  return (
    <div className="space-y-2 p-2 rounded-xl bg-muted/20 border border-border/10">
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        className="h-8 text-[12px]"
        autoFocus
        onKeyDown={e => e.key === "Enter" && name.trim() && onSave(name.trim(), color)}
      />
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 text-[11px] flex-1" onClick={() => name.trim() && onSave(name.trim(), color)} disabled={!name.trim()}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/* ── Tag Badge ── */
export function TagBadge({ tag, onRemove, size = "sm" }: { tag: Tag; onRemove?: () => void; size?: "sm" | "xs" }) {
  const isXs = size === "xs";
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        isXs ? "px-2.5 py-[4px]" : "px-3 py-1"
      } rounded-[2px] ${
        isXs ? "text-[10px]" : "text-[11px]"
      } font-bold tracking-wider uppercase leading-none text-white transition-all duration-150`}
      style={{
        backgroundColor: tag.color,
        boxShadow: `0 2px 6px ${tag.color}50, 0 1px 3px ${tag.color}40`,
      }}
    >
      {tag.name}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:opacity-70 transition-opacity ml-0.5">
          <X className={`${isXs ? "h-2.5 w-2.5" : "h-3 w-3"}`} strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

/* ── Tag Assign Popover (for a conversation) ── */
export function TagAssignPopover({
  conversationId,
  children,
}: {
  conversationId: string;
  children: React.ReactNode;
}) {
  const { tags, getTagsForConversation, assignTag, removeTag, createTag, updateTag } = useTags();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const assignedTags = getTagsForConversation(conversationId);
  const assignedIds = new Set(assignedTags.map(t => t.id));

  const handleToggle = (tag: Tag) => {
    if (assignedIds.has(tag.id)) {
      removeTag.mutate({ conversationId, tagId: tag.id });
    } else {
      assignTag.mutate({ conversationId, tagId: tag.id });
    }
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createTag.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: () => {
          setNewName("");
          setShowCreate(false);
          toast.success("Tag criada");
        },
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 rounded-xl" sideOffset={8}>
        <p className="text-[13px] font-semibold text-foreground mb-2">Tags</p>

        <div className="space-y-1 max-h-48 overflow-y-auto">
          {tags.length === 0 && !showCreate && (
            <p className="text-[12px] text-muted-foreground/50 py-2 text-center">Nenhuma tag criada</p>
          )}
          {tags.map(tag =>
            editingId === tag.id ? (
              <TagEditForm
                key={tag.id}
                tag={tag}
                onSave={(name, color) => {
                  updateTag.mutate({ id: tag.id, name, color }, { onSuccess: () => toast.success("Tag atualizada") });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={tag.id} className="flex items-center gap-1">
                <button
                  onClick={() => handleToggle(tag)}
                  className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors text-left min-w-0"
                >
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-[12px] font-medium text-foreground/80 flex-1 truncate">{tag.name}</span>
                  {assignedIds.has(tag.id) && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                </button>
                <button
                  onClick={() => setEditingId(tag.id)}
                  className="p-1 rounded hover:bg-muted/40 text-muted-foreground/60 hover:text-foreground transition-colors flex-shrink-0"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )
          )}
        </div>

        {showCreate ? (
          <div className="mt-2 pt-2 border-t border-border/10 space-y-2">
            <Input
              placeholder="Nome da tag..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="h-8 text-[12px]"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <div className="flex gap-1.5">
              <Button size="sm" className="h-7 text-[11px] flex-1" onClick={handleCreate} disabled={!newName.trim()}>
                Criar
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 w-full mt-2 pt-2 border-t border-border/10 px-2 py-1.5 rounded-lg hover:bg-muted/40 text-[12px] font-medium text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Criar nova tag
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ── Tag Filter (for sidebar) ── */
export function TagFilterPopover({
  selectedTagIds,
  onToggleTag,
  children,
}: {
  selectedTagIds: Set<string>;
  onToggleTag: (tagId: string) => void;
  children: React.ReactNode;
}) {
  const { tags, deleteTag, updateTag } = useTags();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3 rounded-xl" sideOffset={8}>
        <p className="text-[13px] font-semibold text-foreground mb-2">Filtrar por tag</p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {tags.length === 0 && (
            <p className="text-[12px] text-muted-foreground/50 py-2 text-center">Nenhuma tag criada</p>
          )}
          {tags.map(tag =>
            editingId === tag.id ? (
              <TagEditForm
                key={tag.id}
                tag={tag}
                onSave={(name, color) => {
                  updateTag.mutate({ id: tag.id, name, color }, { onSuccess: () => toast.success("Tag atualizada") });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={tag.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => onToggleTag(tag.id)}
                  className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors text-left min-w-0"
                >
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-[12px] font-medium text-foreground/80 truncate flex-1">{tag.name}</span>
                  {selectedTagIds.has(tag.id) && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                </button>
                <button
                  onClick={() => setEditingId(tag.id)}
                  className="p-1 rounded hover:bg-muted/40 text-muted-foreground/60 hover:text-foreground transition-colors flex-shrink-0"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Excluir tag "${tag.name}"?`)) {
                      deleteTag.mutate(tag.id, { onSuccess: () => toast.success("Tag excluída") });
                    }
                  }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive transition-colors flex-shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )
          )}
        </div>
        {selectedTagIds.size > 0 && (
          <button
            onClick={() => {
              selectedTagIds.forEach(id => onToggleTag(id));
            }}
            className="w-full mt-2 pt-2 border-t border-border/10 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors text-center py-1"
          >
            Limpar filtros
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
