import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Contact, Search, Phone, Download, MoreVertical, Pencil, Trash2, User,
  ChevronLeft, ChevronRight, Filter, X, Check, Plus, ListTodo, CalendarDays, CircleCheck, Clock,
} from "lucide-react";
import whatsappLogo from "@/assets/whatsapp-logo.webp";
import telegramLogo from "@/assets/telegram-logo.png";
import instagramLogo from "@/assets/instagram-logo.png";
import webchatLogo from "@/assets/webchat-logo.png";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { useConversations } from "@/hooks/useChat";
import { PageTransition } from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { useContactCustomFields, useContactCustomFieldValues, FIELD_TYPES, type CustomField, type FieldType } from "@/hooks/useContactCustomFields";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function ContactAvatar({ name, pictureUrl, size = 9 }: { name: string | null; pictureUrl: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    ? name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";
  const sizeClass = size === 16 ? "h-16 w-16 text-lg" : size === 10 ? "h-10 w-10 text-[12px]" : "h-9 w-9 text-[11px]";

  if (pictureUrl && !imgError) {
    return (
      <img
        src={pictureUrl}
        alt={name || ""}
        className={`${sizeClass} rounded-full object-cover border border-border/20 flex-shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-secondary/70 border border-border/20 flex items-center justify-center font-semibold text-foreground/70 tracking-wide flex-shrink-0`}>
      {initials}
    </div>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatMonth(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const month = d.toLocaleString("pt-BR", { month: "long" });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} De ${d.getFullYear()}`;
}

const ITEMS_PER_PAGE = 7;

// Custom Fields Row Component
function CustomFieldRow({
  fields,
  allFields,
  fieldId,
  value,
  onFieldChange,
  onValueChange,
  onRemove,
}: {
  fields: CustomField[];
  allFields: CustomField[];
  fieldId: string;
  value: string;
  onFieldChange: (id: string) => void;
  onValueChange: (val: string) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const selectedField = allFields.find((f) => f.id === fieldId);
  const fieldType = selectedField?.field_type || "text";

  const renderValueInput = () => {
    if (!fieldId) {
      return (
        <Input
          value=""
          disabled
          placeholder={t("contacts.selectFieldFirst")}
          className="h-9 text-[13px] bg-secondary/10 border-border/20"
        />
      );
    }

    switch (fieldType) {
      case "number":
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={t("contacts.enterNumber")}
            className="h-9 text-[13px] bg-secondary/10 border-border/20"
          />
        );
      case "date":
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className="h-9 text-[13px] bg-secondary/10 border-border/20"
          />
        );
      case "select":
        return (
          <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger className="h-9 text-[13px] bg-secondary/10 border-border/20">
              <SelectValue placeholder={t("contacts.selectOption")} />
            </SelectTrigger>
            <SelectContent>
              {(selectedField?.field_options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return (
          <Input
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={t("contacts.enterValue")}
            className="h-9 text-[13px] bg-secondary/10 border-border/20"
          />
        );
    }
  };

  return (
    <div className="grid grid-cols-[1fr_1fr_2.5rem] gap-3 items-end">
      <div className="space-y-1.5">
        <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.fieldLabel")}</Label>
        <Select value={fieldId} onValueChange={onFieldChange}>
          <SelectTrigger className="h-9 text-[13px] bg-secondary/10 border-border/20">
            <SelectValue placeholder={t("contacts.selectField")} />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                <span className="flex items-center gap-2">
                  {f.field_name}
                  <span className="text-[10px] text-muted-foreground/40">
                    {FIELD_TYPES.find((t) => t.value === f.field_type)?.label}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.valueLabel")}</Label>
        {renderValueInput()}
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} className="h-9 w-9 text-muted-foreground/50 hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Manage Fields Dialog
function ManageFieldsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { fields, createField, updateField, deleteField } = useContactCustomFields();
  const { t } = useLanguage();
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = async () => {
    if (!newFieldName.trim()) return;
    const options = newFieldType === "select" ? newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
    await createField({ fieldName: newFieldName.trim(), fieldType: newFieldType, fieldOptions: options });
    setNewFieldName("");
    setNewFieldType("text");
    setNewFieldOptions("");
  };

  const handleSaveEdit = (id: string) => {
    if (editingName.trim()) {
      updateField({ id, field_name: editingName.trim() });
    }
    setEditingId(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contacts.manageCustomFields")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add new field */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder={t("contacts.newFieldName")}
                  className="h-9 text-[13px] flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as FieldType)}>
                  <SelectTrigger className="h-9 text-[13px] w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleCreate} size="sm" className="h-9 px-4 text-xs" disabled={!newFieldName.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t("contacts.createField")}
                </Button>
              </div>
              {newFieldType === "select" && (
                <Input
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  placeholder={t("contacts.optionsSeparated")}
                  className="h-9 text-[13px]"
                />
              )}
            </div>

            <Separator />

            {/* Existing fields */}
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground/50 text-center py-4">{t("contacts.noFieldsYet")}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {fields.map((field) => (
                  <div key={field.id} className="flex items-center gap-2 group">
                    {editingId === field.id ? (
                      <>
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8 text-[13px] flex-1"
                          onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(field.id)}
                          autoFocus
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSaveEdit(field.id)}>
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-[13px] text-foreground flex-1 truncate">{field.field_name}</span>
                        <span className="text-[10px] text-muted-foreground/40 bg-secondary/30 px-2 py-0.5 rounded-full">
                          {FIELD_TYPES.find((t) => t.value === field.field_type)?.label || t("crm.textType")}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => { setEditingId(field.id); setEditingName(field.field_name); }}
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setDeleteFieldTarget({ id: field.id, name: field.field_name })}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFieldTarget} onOpenChange={(open) => !open && setDeleteFieldTarget(null)}>
        <AlertDialogContent className="bg-card border-border/40">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contacts.removeField")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contacts.removeFieldDesc")} <strong>{deleteFieldTarget?.name}</strong>{t("contacts.removeFieldValues")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/30">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteFieldTarget) deleteField(deleteFieldTarget.id);
                setDeleteFieldTarget(null);
              }}
            >
              {t("contacts.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Contact Custom Fields Section in Edit Dialog
function ContactCustomFieldsSection({ conversationId }: { conversationId: string }) {
  const { fields } = useContactCustomFields();
  const { t } = useLanguage();
  const { values, upsertValue, deleteValue, getValueForField } = useContactCustomFieldValues(conversationId);

  // Local state for rows: array of { fieldId, value }
  const [rows, setRows] = useState<{ fieldId: string; value: string }[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize rows from saved values
  if (!initialized && fields.length >= 0) {
    const initialRows = values
      .filter((v) => fields.some((f) => f.id === v.custom_field_id))
      .map((v) => ({ fieldId: v.custom_field_id, value: v.value || "" }));
    if (initialRows.length > 0 || rows.length === 0) {
      // Only set if we have data or no rows
      if (JSON.stringify(initialRows) !== JSON.stringify(rows)) {
        setRows(initialRows.length > 0 ? initialRows : []);
        setInitialized(true);
      }
    }
  }

  const addRow = () => setRows([...rows, { fieldId: "", value: "" }]);

  const updateRow = (index: number, updates: Partial<{ fieldId: string; value: string }>) => {
    setRows(rows.map((r, i) => i === index ? { ...r, ...updates } : r));
  };

  const removeRow = (index: number) => {
    const row = rows[index];
    if (row.fieldId) {
      deleteValue(row.fieldId);
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  // Save all custom field values
  const saveAll = async () => {
    for (const row of rows) {
      if (row.fieldId && row.value.trim()) {
        await upsertValue({ customFieldId: row.fieldId, value: row.value.trim() });
      }
    }
  };

  // Expose save via parent - we'll use a ref approach or just save inline
  // For simplicity, save on blur
  const handleBlur = (index: number) => {
    const row = rows[index];
    if (row.fieldId && row.value.trim()) {
      upsertValue({ customFieldId: row.fieldId, value: row.value.trim() });
    }
  };

  // Available fields (not yet used in rows)
  const usedFieldIds = new Set(rows.map((r) => r.fieldId).filter(Boolean));
  const availableFields = fields.filter((f) => !usedFieldIds.has(f.id));

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <p className="text-sm font-medium text-foreground/70">{t("contacts.customFields")}</p>
        <p className="text-[12px] text-muted-foreground/50 max-w-sm leading-relaxed">
          {t("contacts.customFieldsDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <CustomFieldRow
          key={i}
          fields={row.fieldId ? [...availableFields, fields.find((f) => f.id === row.fieldId)!].filter(Boolean) : availableFields}
          allFields={fields}
          fieldId={row.fieldId}
          value={row.value}
          onFieldChange={(id) => updateRow(i, { fieldId: id })}
          onValueChange={(val) => updateRow(i, { value: val })}
          onRemove={() => removeRow(i)}
        />
      ))}
      {availableFields.length > 0 && (
        <Button variant="outline" size="sm" onClick={addRow} className="h-8 text-xs gap-1.5 border-border/30 rounded-lg">
          <Plus className="h-3.5 w-3.5" />
          {t("contacts.addField")}
        </Button>
      )}
      {rows.length > 0 && availableFields.length === 0 && fields.length > 0 && (
        <p className="text-[11px] text-muted-foreground/40">{t("contacts.allFieldsAdded")}</p>
      )}
    </div>
  );
}

// Contact Tasks Section - shows CRM lead tasks linked to this contact
function ContactTasksSection({ contactPhone, contactEmail }: { contactPhone: string | null; contactEmail: string | null }) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["contact_lead_tasks", contactPhone, contactEmail],
    queryFn: async () => {
      // Find leads matching this contact by phone or email
      let leadIds: string[] = [];
      const conditions: string[] = [];

      let query = supabase.from("leads").select("id");

      if (contactPhone) {
        const phone = contactPhone.replace(/\D/g, "");
        const { data: byPhone } = await supabase
          .from("leads")
          .select("id")
          .or(`phone.ilike.%${phone}%`);
        if (byPhone) leadIds.push(...byPhone.map(l => l.id));
      }

      if (contactEmail) {
        const { data: byEmail } = await supabase
          .from("leads")
          .select("id")
          .ilike("email", `%${contactEmail}%`);
        if (byEmail) leadIds.push(...byEmail.map(l => l.id));
      }

      // Also search by name would be unreliable, so stick with phone/email
      leadIds = [...new Set(leadIds)];

      if (leadIds.length === 0) return [];

      const { data, error } = await supabase
        .from("lead_tasks")
        .select("*")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        lead_id: string;
        title: string;
        due_date: string | null;
        status: string;
        created_at: string;
      }>;
    },
    enabled: !!user && !!(contactPhone || contactEmail),
  });

  if (isLoading) {
    return <p className="text-[12px] text-muted-foreground/40 py-4 text-center">{t("contacts.loadingTasks")}</p>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
        <ListTodo className="h-6 w-6 text-muted-foreground/25" strokeWidth={1.5} />
        <p className="text-[12px] text-muted-foreground/40">{t("contacts.noTasksLinked")}</p>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; icon: typeof CircleCheck; color: string }> = {
    done: { label: t("tasks.done") || "Concluída", icon: CircleCheck, color: "text-emerald-500" },
    pending: { label: t("tasks.pendingStatus") || "Pendente", icon: Clock, color: "text-amber-500" },
  };

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const st = statusConfig[task.status] || statusConfig.pending;
        const Icon = st.icon;
        return (
          <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/15 border border-border/10">
            <Icon className={`h-4 w-4 flex-shrink-0 ${st.color}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-foreground truncate">{task.title}</p>
              {task.due_date && (
                <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 mt-0.5">
                  <CalendarDays className="h-3 w-3" />
                  {new Date(task.due_date).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              task.status === "done" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
            }`}>
              {st.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Contacts() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { conversations, isLoading } = useConversations();
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editContact, setEditContact] = useState<typeof conversations[0] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [manageFieldsOpen, setManageFieldsOpen] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editState, setEditState] = useState("");
  const [editCity, setEditCity] = useState("");

  const contacts = useMemo(() => {
    const map = new Map<string, typeof conversations[0]>();
    for (const conv of conversations) {
      const key = conv.remote_jid;
      const existing = map.get(key);
      if (!existing || (conv.last_message_at && (!existing.last_message_at || conv.last_message_at > existing.last_message_at))) {
        map.set(key, conv);
      }
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => (a.contact_name || "").localeCompare(b.contact_name || ""));
    return arr;
  }, [conversations]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return contacts;
    const term = searchTerm.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.contact_name || "").toLowerCase().includes(term) ||
        (c.contact_phone || "").toLowerCase().includes(term)
    );
  }, [contacts, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedContacts = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const showingStart = filtered.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const showingEnd = Math.min(currentPage * ITEMS_PER_PAGE, filtered.length);

  const handleRename = useCallback(async (conversationId: string, newName: string) => {
    const { error } = await supabase
      .from("conversations")
      .update({ contact_name: newName })
      .eq("id", conversationId);
    if (error) {
      toast.error(t("contacts.renameError"));
    } else {
      toast.success(t("contacts.renamed"));
    }
  }, [t]);

  const handleDelete = useCallback(async (conversationId: string) => {
    const { error: msgErr } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);
    if (msgErr) {
      toast.error(t("contacts.deleteMessagesError"));
      return;
    }
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);
    if (error) {
      toast.error(t("contacts.deleteError"));
    } else {
      toast.success(t("contacts.deleted"));
    }
  }, [t]);

  const handleExportExcel = useCallback(async () => {
    if (!filtered.length) return;
    const data = filtered.map((c) => ({
      Nome: c.contact_name || "",
      Telefone: c.contact_phone || "",
      "E-mail": "Não informado",
    }));
    const { exportCsv } = await import("@/lib/export-csv");
    exportCsv(data, `contatos-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`${filtered.length} contatos exportados`);
  }, [filtered]);

  const openEdit = (contact: typeof conversations[0]) => {
    setEditContact(contact);
    setEditName(contact.contact_name || "");
    setEditEmail((contact as any).contact_email || "");
    setEditGender((contact as any).contact_gender || "");
    setEditBirthDate((contact as any).contact_birth_date || "");
    setEditJobTitle((contact as any).contact_job_title || "");
    setEditCompany((contact as any).contact_company || "");
    setEditState((contact as any).contact_state || "");
    setEditCity((contact as any).contact_city || "");
  };

  const handleSaveEdit = async () => {
    if (!editContact) return;
    const updates: Record<string, any> = {};
    if (editName.trim()) updates.contact_name = editName.trim();
    if (editEmail.trim()) updates.contact_email = editEmail.trim();
    if (editGender.trim()) updates.contact_gender = editGender.trim();
    if (editBirthDate.trim()) updates.contact_birth_date = editBirthDate.trim();
    if (editJobTitle.trim()) updates.contact_job_title = editJobTitle.trim();
    if (editCompany.trim()) updates.contact_company = editCompany.trim();
    if (editState.trim()) updates.contact_state = editState.trim();
    if (editCity.trim()) updates.contact_city = editCity.trim();

    // Allow clearing fields too
    if (!editEmail.trim()) updates.contact_email = null;
    if (!editGender.trim()) updates.contact_gender = null;
    if (!editBirthDate.trim()) updates.contact_birth_date = null;
    if (!editJobTitle.trim()) updates.contact_job_title = null;
    if (!editCompany.trim()) updates.contact_company = null;
    if (!editState.trim()) updates.contact_state = null;
    if (!editCity.trim()) updates.contact_city = null;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("conversations")
        .update(updates as any)
        .eq("id", editContact.id);
      if (error) {
        toast.error(t("contacts.saveError"));
        return;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    setEditContact(null);
    toast.success(t("contacts.saved"));
  };

  return (
    <PageTransition>
      <div className="space-y-8 w-full">
        {/* Header — Apple-style */}
        <motion.div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">{t("contacts.title")}</h1>
            <p className="text-sm text-muted-foreground/50 mt-1">{t("contacts.subtitle")}</p>
          </div>
          <Button
            variant="default"
            size="sm"
            className="h-10 text-sm gap-2 rounded-2xl px-5 bg-foreground text-background hover:bg-foreground/90 font-medium shadow-none"
            onClick={() => setManageFieldsOpen(true)}
          >
            <Contact className="h-3.5 w-3.5" />
            {t("contacts.manageFields")}
          </Button>
        </motion.div>

        {/* Table card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
        <Card className="border-border/15 rounded-2xl overflow-hidden shadow-none">
          <CardContent className="p-0">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-border/8">
              <span className="text-[13px] text-muted-foreground/40 font-medium">
                {filtered.length} contatos
              </span>
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
                  <Input
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="pl-10 bg-muted/30 border-0 h-9 text-[13px] rounded-xl w-full sm:w-52 placeholder:text-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-border/30"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExportExcel}
                  className="h-9 text-[13px] gap-1.5 rounded-xl px-3.5 text-muted-foreground hover:text-foreground shrink-0"
                  disabled={!filtered.length}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </div>
            </div>

            {/* Table header */}
            <div className="hidden md:grid grid-cols-[2.5rem_1fr_12rem_12rem_2.5rem] items-center gap-x-4 px-6 py-3 border-b border-border/6 text-[11px] font-medium text-muted-foreground/40 uppercase tracking-wider">
              <span />
              <span>Nome</span>
              <span>Telefone</span>
              <span>E-mail</span>
              <span />
            </div>

            {/* Rows */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground/40 text-sm">
                Carregando...
              </div>
            ) : paginatedContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Contact className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.2} />
                <p className="text-sm text-muted-foreground/40">
                  {searchTerm ? "Nenhum contato encontrado" : "Nenhum contato ainda"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/8">
                {paginatedContacts.map((contact, i) => (
                  <motion.div
                    key={contact.remote_jid}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02, duration: 0.2 }}
                    className="flex items-center gap-3 px-4 md:px-6 py-3.5 group hover:bg-muted/20 transition-all duration-200 cursor-pointer md:grid md:grid-cols-[2.5rem_1fr_12rem_12rem_2.5rem] md:gap-x-4"
                    onClick={() => openEdit(contact)}
                  >
                    <ContactAvatar name={contact.contact_name} pictureUrl={contact.profile_picture_url} size={10} />

                    <span className="text-[13px] font-medium text-foreground truncate">
                      {contact.contact_name || contact.contact_phone || "Desconhecido"}
                    </span>

                    <span className="hidden md:block text-[13px] text-muted-foreground/50 truncate">
                      {contact.contact_phone || "Não informado"}
                    </span>

                    <span className="hidden md:block text-[13px] text-muted-foreground/40 truncate">
                      {(contact as any).contact_email || "Não informado"}
                    </span>

                    <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors rounded-md hover:bg-secondary/30">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => openEdit(contact)} className="gap-2 text-[13px]">
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget({ id: contact.id, name: contact.contact_name || contact.contact_phone || "Desconhecido" })}
                            className="gap-2 text-[13px] text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 px-6 py-4 border-t border-border/6">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`h-8 w-8 rounded-xl text-[12px] font-medium transition-all duration-200 ${
                      currentPage === page
                        ? "bg-foreground text-background"
                        : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/30"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
        </motion.div>
      </div>

      {/* Manage Fields Dialog */}
      <ManageFieldsDialog open={manageFieldsOpen} onOpenChange={setManageFieldsOpen} />

      {/* Edit Contact Dialog */}
      <Dialog open={!!editContact} onOpenChange={(open) => !open && setEditContact(null)}>
        <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
          <div className="flex flex-col md:flex-row md:min-h-[520px]">
            {/* Left sidebar */}
            <div className="hidden md:flex w-56 border-r border-border/15 bg-secondary/5 flex-col items-center py-8 px-4 gap-4 flex-shrink-0">
              <ContactAvatar
                name={editContact?.contact_name || null}
                pictureUrl={editContact?.profile_picture_url || null}
                size={16}
              />
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{editContact?.contact_name || "Desconhecido"}</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">{formatMonth(editContact?.created_at || null)}</p>
              </div>
              <Separator className="my-1" />
              <div className="w-full space-y-3 text-[11px]">
                <div>
                  <span className="text-primary/70 font-medium">Cadastrado em</span>
                  <p className="text-foreground/70 mt-0.5">{formatDate(editContact?.created_at || null)}</p>
                </div>
                <div>
                  <span className="text-primary/70 font-medium">Última interação</span>
                  <p className="text-foreground/70 mt-0.5">{formatDate(editContact?.last_message_at || null)}</p>
                </div>
                <div>
                  <span className="text-primary/70 font-medium">Telefone</span>
                  <p className="text-foreground/70 mt-0.5">{editContact?.contact_phone || "Não informado"}</p>
                </div>
                <div>
                  <span className="text-primary/70 font-medium">E-mail</span>
                  <p className="text-foreground/70 mt-0.5">{(editContact as any)?.contact_email || "Não informado"}</p>
                </div>
                <div>
                  <span className="text-primary/70 font-medium">Canais</span>
                  <div className="mt-1">
                    {editContact && (() => {
                      const jid = editContact.remote_jid;
                      const ch = jid.startsWith("telegram:") ? { name: "Telegram", logo: telegramLogo } :
                        jid.startsWith("instagram:") ? { name: "Instagram", logo: instagramLogo } :
                        jid.startsWith("widget:") ? { name: "Webchat", logo: webchatLogo } :
                        { name: "WhatsApp", logo: whatsappLogo };
                      return (
                        <span className="inline-flex items-center gap-1.5 text-[10px] bg-secondary/40 px-2 py-0.5 rounded-full text-foreground/60">
                          <img src={ch.logo} alt={ch.name} className="h-3.5 w-3.5 object-contain" />
                          {ch.name}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Right form */}
            <div className="flex-1 flex flex-col">
              {/* Tab */}
              <div className="px-6 pt-5 border-b border-border/10">
                <div className="flex items-center gap-2 pb-3 border-b-2 border-primary w-fit">
                  <User className="h-4 w-4 text-muted-foreground/60" />
                  <span className="text-sm font-medium text-foreground">Dados gerais</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Row 1: Nome, Telefone, E-mail */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.name")}</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 text-[13px] bg-secondary/10 border-border/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">Telefone</Label>
                    <Input value={editContact?.contact_phone || ""} readOnly className="h-9 text-[13px] bg-secondary/10 border-border/20 text-muted-foreground/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.email")}</Label>
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Ex: contato@email.com" className="h-9 text-[13px] bg-secondary/10 border-border/20" />
                  </div>
                </div>

                {/* Row 2: Gênero, Data nascimento, Cargo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.gender")}</Label>
                    <Input value={editGender} onChange={(e) => setEditGender(e.target.value)} placeholder="Ex. Masculino" className="h-9 text-[13px] bg-secondary/10 border-border/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.birthDate")}</Label>
                    <Input value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} type="date" className="h-9 text-[13px] bg-secondary/10 border-border/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.jobTitle")}</Label>
                    <Input value={editJobTitle} onChange={(e) => setEditJobTitle(e.target.value)} placeholder="Informe o cargo" className="h-9 text-[13px] bg-secondary/10 border-border/20" />
                  </div>
                </div>

                <Separator />
                <h3 className="text-sm font-medium text-foreground">Sobre a empresa</h3>

                {/* Row 3: Empresa, Estado, Cidade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">Nome da empresa</Label>
                    <Input value={editCompany} onChange={(e) => setEditCompany(e.target.value)} placeholder="Empresa do contato" className="h-9 text-[13px] bg-secondary/10 border-border/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.state")}</Label>
                    <Input value={editState} onChange={(e) => setEditState(e.target.value)} placeholder="Estado da empresa" className="h-9 text-[13px] bg-secondary/10 border-border/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-primary/70 font-medium">{t("contacts.city")}</Label>
                    <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="Cidade da empresa" className="h-9 text-[13px] bg-secondary/10 border-border/20" />
                  </div>
                </div>

                <Separator />
                <h3 className="text-sm font-medium text-foreground">Campos customizados</h3>

                {/* Custom fields section */}
                {editContact && <ContactCustomFieldsSection conversationId={editContact.id} />}

                <Separator />
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-muted-foreground/50" />
                  Tarefas do CRM
                </h3>

                {editContact && (
                  <ContactTasksSection
                    contactPhone={editContact.contact_phone}
                    contactEmail={(editContact as any).contact_email}
                  />
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/10">
                <Button variant="outline" onClick={() => setEditContact(null)} className="h-9 text-[13px] rounded-xl px-5 border-border/20">
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit} className="h-9 text-[13px] rounded-xl px-5 bg-primary text-primary-foreground">
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border/40">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contacts.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contacts.deleteDesc")} <strong>{deleteTarget?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/30">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {t("contacts.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
