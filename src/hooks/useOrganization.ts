import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  plan_id: string | null;
  subscription_status: string;
  billing_period: string;
  current_period_start: string;
  current_period_end: string | null;
  created_at: string;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
  // joined from profiles
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

export function useOrganization() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["organization", user?.id],
    queryFn: async () => {
      // Get user's org membership
      const { data: membership, error: memErr } = await supabase
        .from("organization_members" as any)
        .select("organization_id, role")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (memErr) throw memErr;
      if (!membership) return null;

      const m = membership as any;

      // Get organization with plan
      const { data: org, error: orgErr } = await supabase
        .from("organizations" as any)
        .select("*")
        .eq("id", m.organization_id)
        .single();
      if (orgErr) throw orgErr;

      // Get plan if exists
      let plan = null;
      if ((org as any).plan_id) {
        const { data: p } = await supabase
          .from("plans" as any)
          .select("*")
          .eq("id", (org as any).plan_id)
          .single();
        plan = p;
      }

      return {
        org: org as unknown as Organization,
        myRole: m.role as string,
        plan,
      };
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members" as any)
        .select("*")
        .eq("organization_id", orgId!);
      if (error) throw error;

      const members = data as any[];

      // Enrich with profile data
      const userIds = members.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      return members.map((m) => {
        const profile = profiles?.find((p) => p.user_id === m.user_id);
        return {
          ...m,
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
        } as OrgMember;
      });
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Organization> }) => {
      const { error } = await supabase
        .from("organizations" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization"] });
      toast.success("Organização atualizada!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRemoveOrgMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("organization_members" as any)
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("Membro removido!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await supabase
        .from("organization_members" as any)
        .update({ role } as any)
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("Papel atualizado!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
