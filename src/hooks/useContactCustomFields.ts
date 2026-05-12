import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Data" },
  { value: "select", label: "Lista de opções" },
] as const;

export type FieldType = typeof FIELD_TYPES[number]["value"];

export interface CustomField {
  id: string;
  user_id: string;
  field_name: string;
  field_type: FieldType;
  field_options: string[] | null;
  position: number;
  created_at: string;
}

export interface CustomFieldValue {
  id: string;
  custom_field_id: string;
  conversation_id: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

export function useContactCustomFields() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const fieldsQuery = useQuery({
    queryKey: ["contact_custom_fields", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_custom_fields" as any)
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data as unknown as any[]).map((d) => ({
        ...d,
        field_options: d.field_options ? (typeof d.field_options === "string" ? JSON.parse(d.field_options) : d.field_options) : null,
      })) as CustomField[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const createField = useMutation({
    mutationFn: async ({ fieldName, fieldType, fieldOptions }: { fieldName: string; fieldType: FieldType; fieldOptions?: string[] }) => {
      if (!user) throw new Error("Not authenticated");
      const maxPos = (fieldsQuery.data || []).reduce((max, f) => Math.max(max, f.position), -1);
      const insertData: any = {
        user_id: user.id,
        field_name: fieldName,
        field_type: fieldType,
        position: maxPos + 1,
      };
      if (fieldType === "select" && fieldOptions?.length) {
        insertData.field_options = fieldOptions;
      }
      const { data, error } = await supabase
        .from("contact_custom_fields" as any)
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CustomField;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_custom_fields"] });
      toast.success("Campo criado");
    },
    onError: (e: any) => toast.error("Erro ao criar campo: " + e.message),
  });

  const updateField = useMutation({
    mutationFn: async ({ id, field_name, field_type, field_options }: { id: string; field_name?: string; field_type?: FieldType; field_options?: string[] | null }) => {
      const updates: any = {};
      if (field_name !== undefined) updates.field_name = field_name;
      if (field_type !== undefined) updates.field_type = field_type;
      if (field_options !== undefined) updates.field_options = field_options;
      const { error } = await supabase
        .from("contact_custom_fields" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_custom_fields"] });
    },
    onError: (e: any) => toast.error("Erro ao atualizar campo: " + e.message),
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contact_custom_fields" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_custom_fields"] });
      queryClient.invalidateQueries({ queryKey: ["contact_custom_field_values"] });
      toast.success("Campo removido");
    },
    onError: (e: any) => toast.error("Erro ao remover campo: " + e.message),
  });

  return {
    fields: fieldsQuery.data ?? [],
    isLoading: fieldsQuery.isLoading,
    createField: createField.mutateAsync,
    updateField: updateField.mutate,
    deleteField: deleteField.mutate,
  };
}

export function useContactCustomFieldValues(conversationId: string | null) {
  const queryClient = useQueryClient();

  const valuesQuery = useQuery({
    queryKey: ["contact_custom_field_values", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_custom_field_values" as any)
        .select("*")
        .eq("conversation_id", conversationId!);
      if (error) throw error;
      return data as unknown as CustomFieldValue[];
    },
    enabled: !!conversationId,
  });

  const upsertValue = useMutation({
    mutationFn: async ({ customFieldId, value }: { customFieldId: string; value: string }) => {
      if (!conversationId) throw new Error("No conversation");
      const { data: existing } = await supabase
        .from("contact_custom_field_values" as any)
        .select("id")
        .eq("custom_field_id", customFieldId)
        .eq("conversation_id", conversationId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("contact_custom_field_values" as any)
          .update({ value, updated_at: new Date().toISOString() } as any)
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contact_custom_field_values" as any)
          .insert({
            custom_field_id: customFieldId,
            conversation_id: conversationId,
            value,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_custom_field_values", conversationId] });
    },
    onError: (e: any) => toast.error("Erro ao salvar valor: " + e.message),
  });

  const deleteValue = useMutation({
    mutationFn: async (customFieldId: string) => {
      if (!conversationId) return;
      const { error } = await supabase
        .from("contact_custom_field_values" as any)
        .delete()
        .eq("custom_field_id", customFieldId)
        .eq("conversation_id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_custom_field_values", conversationId] });
    },
  });

  return {
    values: valuesQuery.data ?? [],
    isLoading: valuesQuery.isLoading,
    upsertValue: upsertValue.mutateAsync,
    deleteValue: deleteValue.mutate,
    getValueForField: (fieldId: string) => {
      return (valuesQuery.data ?? []).find((v) => v.custom_field_id === fieldId)?.value || "";
    },
  };
}
