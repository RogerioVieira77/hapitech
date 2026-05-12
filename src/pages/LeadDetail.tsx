import { useParams, useNavigate } from "react-router-dom";
import { useLeads } from "@/hooks/useLeads";
import { useCrmStages } from "@/hooks/useCrmStages";
import { useCrmCustomFields } from "@/hooks/useCrmCustomFields";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import LeadDetailPanel from "@/components/LeadDetailPanel";
import { Loader2 } from "lucide-react";

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { leads, updateLead } = useLeads();

  const lead = leads.find(l => l.id === id);

  const { data: stageRow } = useQuery({
    queryKey: ["lead-stage-pipeline", lead?.stage],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_stages")
        .select("pipeline_id")
        .eq("slug", lead!.stage)
        .limit(1)
        .single();
      return data as { pipeline_id: string | null } | null;
    },
    enabled: !!lead,
  });

  const pipelineId = stageRow?.pipeline_id || null;
  const { stages } = useCrmStages(pipelineId);
  const { fields, fieldValues, setFieldValue } = useCrmCustomFields(pipelineId);

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <LeadDetailPanel
      lead={lead}
      stages={stages}
      customFields={fields}
      fieldValues={fieldValues}
      onClose={() => navigate("/crm")}
      onUpdate={(updates) => updateLead(updates)}
      onSetFieldValue={({ leadId, fieldId, value }) =>
        setFieldValue.mutate({ leadId, fieldId, value })
      }
      fullPage
    />
  );
}
