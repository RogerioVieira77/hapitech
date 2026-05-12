import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface LeadProduct {
  id: string;
  lead_id: string;
  user_id: string;
  name: string;
  quantity: number;
  price: number;
  created_at: string;
}

export interface LeadTask {
  id: string;
  lead_id: string;
  user_id: string;
  title: string;
  description?: string;
  task_type?: string;
  due_date: string | null;
  assigned_to: string | null;
  status: string;
  created_at: string;
}

export interface LeadComment {
  id: string;
  lead_id: string;
  user_id: string;
  content: string;
  created_at: string;
  // joined
  display_name?: string;
}

// --- Products ---
export function useLeadProducts(leadId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["lead_products", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_products" as any)
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as LeadProduct[];
    },
    enabled: !!leadId && !!user,
  });

  const upsert = useMutation({
    mutationFn: async (products: Partial<LeadProduct>[]) => {
      if (!user || !leadId) throw new Error("Missing data");
      // Delete existing
      await supabase.from("lead_products" as any).delete().eq("lead_id", leadId);
      // Insert new
      if (products.length > 0) {
        const rows = products.map(p => ({
          lead_id: leadId,
          user_id: user.id,
          name: p.name || "",
          quantity: p.quantity || 1,
          price: p.price || 0,
        }));
        const { error } = await supabase.from("lead_products" as any).insert(rows as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_products", leadId] });
      toast.success("Produtos salvos");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { products: query.data ?? [], isLoading: query.isLoading, saveProducts: upsert.mutate };
}

// --- Tasks ---
export function useLeadTasks(leadId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["lead_tasks", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tasks" as any)
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as LeadTask[];
    },
    enabled: !!leadId && !!user,
  });

  const upsert = useMutation({
    mutationFn: async (tasks: Partial<LeadTask>[]) => {
      if (!user || !leadId) throw new Error("Missing data");
      await supabase.from("lead_tasks" as any).delete().eq("lead_id", leadId);
      if (tasks.length > 0) {
        const rows = tasks.map(t => ({
          lead_id: leadId,
          user_id: user.id,
          title: t.title || "",
          task_type: t.task_type || "task",
          due_date: t.due_date || null,
          assigned_to: t.assigned_to || null,
          status: t.status || "pending",
        }));
        const { error } = await supabase.from("lead_tasks" as any).insert(rows as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_tasks", leadId] });
      qc.invalidateQueries({ queryKey: ["all_lead_tasks"] });
      toast.success("Tarefas salvas");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { tasks: query.data ?? [], isLoading: query.isLoading, saveTasks: upsert.mutate };
}

// --- Comments ---
export function useLeadComments(leadId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["lead_comments", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_comments" as any)
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const comments = (data || []) as unknown as LeadComment[];
      // Enrich with display names
      const userIds = [...new Set(comments.map(c => c.user_id))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        return comments.map(c => ({
          ...c,
          display_name: profiles?.find(p => p.user_id === c.user_id)?.display_name || "Usuário",
        }));
      }
      return comments;
    },
    enabled: !!leadId && !!user,
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !leadId) throw new Error("Missing data");
      const { error } = await supabase
        .from("lead_comments" as any)
        .insert({ lead_id: leadId, user_id: user.id, content } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_comments", leadId] }),
    onError: (e: any) => toast.error(e.message),
  });

  return { comments: query.data ?? [], isLoading: query.isLoading, addComment: addComment.mutate };
}
