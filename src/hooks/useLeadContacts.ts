import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export interface LeadContact {
  id: string;
  lead_id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  created_at: string;
}

export function useLeadContacts(leadId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["lead-contacts", leadId];

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contacts" as any)
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LeadContact[];
    },
    enabled: !!leadId && !!user,
  });

  const addContact = useMutation({
    mutationFn: async (contact: { name: string; phone?: string; email?: string; role: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("lead_contacts" as any).insert({
        lead_id: leadId,
        user_id: user.id,
        name: contact.name,
        phone: contact.phone || null,
        email: contact.email || null,
        role: contact.role,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Contato adicionado");
    },
    onError: (e: any) => toast.error("Erro ao adicionar contato: " + e.message),
  });

  const updateContact = useMutation({
    mutationFn: async (contact: Partial<LeadContact> & { id: string }) => {
      const { id, ...updates } = contact;
      const { error } = await supabase.from("lead_contacts" as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from("lead_contacts" as any).delete().eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { contacts, isLoading, addContact, updateContact, deleteContact };
}
