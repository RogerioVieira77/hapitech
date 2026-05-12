import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface CrmCustomField {
  id: string;
  user_id: string;
  pipeline_id: string | null;
  name: string;
  field_type: string; // text, number, date, select, name
  options: string[]; // for select type
  show_on_board: boolean;
  show_on_list: boolean;
  position: number;
  created_at: string;
}

export interface CrmCustomFieldValue {
  id: string;
  lead_id: string;
  field_id: string;
  value: string | null;
  created_at: string;
}

export function useCrmCustomFields(pipelineId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ["crm_custom_fields", user?.id, pipelineId],
    queryFn: async () => {
      let q = supabase
        .from("crm_custom_fields" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("position");
      if (pipelineId) q = q.eq("pipeline_id", pipelineId);
      const { data, error } = await q;
      if (error) {
        // Table may not exist yet – return empty gracefully
        if (error.code === "PGRST205" || error.message?.includes("Could not find")) return [];
        throw error;
      }
      return ((data || []) as unknown as CrmCustomField[]).map(f => ({
        ...f,
        options: Array.isArray(f.options) ? f.options : [],
      }));
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const { data: fieldValues = [] } = useQuery({
    queryKey: ["crm_custom_field_values", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_custom_field_values" as any)
        .select("*");
      if (error) {
        if (error.code === "PGRST205" || error.message?.includes("Could not find")) return [];
        throw error;
      }
      return (data || []) as unknown as CrmCustomFieldValue[];
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const addField = useMutation({
    mutationFn: async (f: { name: string; field_type: string; options?: string[]; pipeline_id?: string | null }) => {
      const pos = fields.length;
      const { error } = await supabase
        .from("crm_custom_fields" as any)
        .insert({
          name: f.name,
          field_type: f.field_type,
          options: f.options || [],
          pipeline_id: f.pipeline_id || pipelineId,
          user_id: user!.id,
          position: pos,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_custom_fields"] });
      toast.success("Campo criado");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const updateField = useMutation({
    mutationFn: async (f: Partial<CrmCustomField> & { id: string }) => {
      const { id, ...updates } = f;
      const { error } = await supabase
        .from("crm_custom_fields" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_custom_fields"] }),
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crm_custom_fields" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_custom_fields"] });
      qc.invalidateQueries({ queryKey: ["crm_custom_field_values"] });
      toast.success("Campo removido");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const setFieldValue = useMutation({
    mutationFn: async ({ leadId, fieldId, value }: { leadId: string; fieldId: string; value: string }) => {
      const { error } = await supabase
        .from("crm_custom_field_values" as any)
        .upsert({ lead_id: leadId, field_id: fieldId, value } as any, { onConflict: "lead_id,field_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_custom_field_values"] }),
  });

  const getValuesForLead = (leadId: string) => {
    return fieldValues.filter(v => v.lead_id === leadId);
  };

  return { fields, fieldValues, isLoading, addField, updateField, deleteField, setFieldValue, getValuesForLead };
}
