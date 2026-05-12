import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns all user_ids belonging to the same organization as the current user.
 * Used to aggregate data across the entire org (dashboard, credits, etc.)
 */
export function useOrgUserIds() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["org_user_ids", user?.id],
    queryFn: async (): Promise<string[]> => {
      const { data: orgId } = await (supabase.rpc as any)("get_user_org_id", { _user_id: user!.id });
      if (!orgId) return [user!.id];

      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId);

      if (!members?.length) return [user!.id];
      return members.map((m) => m.user_id);
    },
    enabled: !!user,
    staleTime: 10 * 60_000, // 10min — org membership rarely changes
    refetchOnMount: false,
  });
}
