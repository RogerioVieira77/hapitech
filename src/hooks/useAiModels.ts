import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AiProvider {
  id: string;
  name: string;
  display_name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
}

export interface AiModel {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  is_enabled: boolean;
  credits_per_response: number;
}

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-models-proxy`;

async function callProxy(body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Erro desconhecido");
  return json;
}

export function useAiModelsAdmin() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const { providers: data } = await callProxy({ action: "list_providers" });
      setProviders((data as AiProvider[]) || []);
    } catch {
      toast.error("Erro ao carregar provedores");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProvider = useCallback(async (providerName: string, apiKey: string): Promise<AiProvider[]> => {
    await callProxy({ action: "save_provider", providerName, apiKey });
    const { providers: data } = await callProxy({ action: "list_providers" });
    const updated = (data as AiProvider[]) || [];
    setProviders(updated);
    return updated;
  }, []);

  const deleteProvider = useCallback(async (providerId: string) => {
    await callProxy({ action: "delete_provider", providerId });
    await loadProviders();
    setModels([]);
  }, [loadProviders]);

  const fetchModels = useCallback(async (providerId: string): Promise<AiModel[]> => {
    setFetchingModels(true);
    try {
      const { models: fetchedModels } = await callProxy({ action: "fetch_models", providerId });
      const result = (fetchedModels || []) as AiModel[];
      setModels(result);
      return result;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar modelos");
      return [];
    } finally {
      setFetchingModels(false);
    }
  }, []);

  const toggleModel = useCallback(async (modelId: string, enabled: boolean) => {
    try {
      await callProxy({ action: "toggle_model", modelId, enabled });
      setModels(prev =>
        prev.map(m => m.id === modelId ? { ...m, is_enabled: enabled } : m)
      );
    } catch {
      toast.error("Erro ao atualizar modelo");
    }
  }, []);

  const updateModelCredits = useCallback(async (modelId: string, credits: number) => {
    try {
      await callProxy({ action: "update_credits", modelId, credits });
      setModels(prev =>
        prev.map(m => m.id === modelId ? { ...m, credits_per_response: credits } : m)
      );
    } catch {
      toast.error("Erro ao atualizar créditos");
    }
  }, []);

  return {
    providers,
    models,
    loading,
    fetchingModels,
    loadProviders,
    saveProvider,
    deleteProvider,
    fetchModels,
    toggleModel,
    updateModelCredits,
  };
}

// Hook for regular users — just loads enabled models
export function useEnabledAiModels() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("ai_models" as any)
        .select("model_id, display_name, is_enabled")
        .eq("is_enabled", true)
        .order("display_name");
      setModels((data as unknown as AiModel[]) || []);
    } catch {
      // silently fail — fallback to hardcoded list
    } finally {
      setLoading(false);
    }
  }, []);

  return { models, loading, load };
}
