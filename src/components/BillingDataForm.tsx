import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface BillingData {
  id?: string;
  organization_id: string;
  document_type: "cpf" | "cnpj";
  document_number: string;
  legal_name: string;
  email: string;
  phone: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

const EMPTY: BillingData = {
  organization_id: "",
  document_type: "cpf",
  document_number: "",
  legal_name: "",
  email: "",
  phone: "",
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

const STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function formatCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d{3})?(\d{3})?(\d{2})?/, (_, a, b, c, e) =>
    [a, b, c].filter(Boolean).join(".") + (e ? `-${e}` : "")
  );
}

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d.replace(/(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{2})?/, (_, a, b, c, dd, e) =>
    a + (b ? `.${b}` : "") + (c ? `.${c}` : "") + (dd ? `/${dd}` : "") + (e ? `-${e}` : "")
  );
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})?(\d{4})?/, (_, a, b, c) =>
      `(${a})` + (b ? ` ${b}` : "") + (c ? `-${c}` : "")
    );
  }
  return d.replace(/(\d{2})(\d{5})?(\d{4})?/, (_, a, b, c) =>
    `(${a})` + (b ? ` ${b}` : "") + (c ? `-${c}` : "")
  );
}

function formatCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d{3})?/, (_, a, b) => a + (b ? `-${b}` : ""));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  existing?: BillingData | null;
  onSaved: () => void;
}

export function BillingDataForm({ open, onOpenChange, organizationId, existing, onSaved }: Props) {
  const [form, setForm] = useState<BillingData>({ ...EMPTY, organization_id: organizationId });
  const [saving, setSaving] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm(existing);
    } else {
      setForm({ ...EMPTY, organization_id: organizationId });
    }
  }, [existing, organizationId, open]);

  const update = (field: keyof BillingData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const lookupCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setFetchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch {
      // ignore
    } finally {
      setFetchingCep(false);
    }
  };

  const handleSave = async () => {
    const docDigits = form.document_number.replace(/\D/g, "");
    if (form.document_type === "cpf" && docDigits.length !== 11) {
      toast.error("CPF deve ter 11 dígitos.");
      return;
    }
    if (form.document_type === "cnpj" && docDigits.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos.");
      return;
    }
    if (!form.legal_name.trim()) {
      toast.error("Razão social / Nome é obrigatório.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        document_type: form.document_type,
        document_number: docDigits,
        legal_name: form.legal_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.replace(/\D/g, "") || null,
        zip_code: form.zip_code.replace(/\D/g, "") || null,
        street: form.street.trim() || null,
        number: form.number.trim() || null,
        complement: form.complement.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null,
        state: form.state || null,
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("billing_data")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("billing_data")
          .insert(payload);
        if (error) throw error;
      }

      toast.success("Dados fiscais salvos com sucesso!");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar dados fiscais.");
    } finally {
      setSaving(false);
    }
  };

  const docFormat = form.document_type === "cpf" ? formatCpf : formatCnpj;
  const docPlaceholder = form.document_type === "cpf" ? "000.000.000-00" : "00.000.000/0000-00";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dados para Notas Fiscais</DialogTitle>
          <DialogDescription>
            Preencha as informações de faturamento da sua organização.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Document type + number */}
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={form.document_type} onValueChange={(v) => update("document_type", v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="cnpj">CNPJ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{form.document_type === "cpf" ? "CPF" : "CNPJ"}</Label>
              <Input
                className="h-9 text-sm"
                placeholder={docPlaceholder}
                value={form.document_number}
                onChange={(e) => update("document_number", docFormat(e.target.value))}
                maxLength={form.document_type === "cpf" ? 14 : 18}
              />
            </div>
          </div>

          {/* Legal name */}
          <div className="space-y-1.5">
            <Label className="text-xs">{form.document_type === "cnpj" ? "Razão Social" : "Nome Completo"}</Label>
            <Input
              className="h-9 text-sm"
              placeholder={form.document_type === "cnpj" ? "Razão Social da Empresa" : "Nome Completo"}
              value={form.legal_name}
              onChange={(e) => update("legal_name", e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail</Label>
              <Input
                className="h-9 text-sm"
                type="email"
                placeholder="email@empresa.com"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input
                className="h-9 text-sm"
                placeholder="(00) 00000-0000"
                value={form.phone}
                onChange={(e) => update("phone", formatPhone(e.target.value))}
                maxLength={15}
              />
            </div>
          </div>

          <div className="h-px bg-border/20 my-1" />

          {/* Address */}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">CEP</Label>
              <Input
                className="h-9 text-sm"
                placeholder="00000-000"
                value={form.zip_code}
                onChange={(e) => {
                  const v = formatCep(e.target.value);
                  update("zip_code", v);
                  if (v.replace(/\D/g, "").length === 8) lookupCep(v);
                }}
                maxLength={9}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado</Label>
              <Select value={form.state} onValueChange={(v) => update("state", v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {STATES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Rua / Logradouro</Label>
            <Input
              className="h-9 text-sm"
              placeholder="Rua, Avenida..."
              value={form.street}
              onChange={(e) => update("street", e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Número</Label>
              <Input
                className="h-9 text-sm"
                placeholder="123"
                value={form.number}
                onChange={(e) => update("number", e.target.value)}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Complemento</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Sala, Apto..."
                value={form.complement}
                onChange={(e) => update("complement", e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bairro</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Bairro"
                value={form.neighborhood}
                onChange={(e) => update("neighborhood", e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cidade</Label>
            <Input
              className="h-9 text-sm"
              placeholder="Cidade"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              maxLength={100}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
