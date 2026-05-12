import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type EffectiveRole = "super_admin" | "admin" | "user";

export function useUserRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user_role", user?.id],
    queryFn: async (): Promise<EffectiveRole> => {
      // Check super_admin in user_roles table
      const { data: isSuperAdmin } = await (supabase.rpc as any)("has_role", {
        _user_id: user!.id,
        _role: "super_admin",
      });
      if (isSuperAdmin) return "super_admin";

      // Check admin in user_roles table
      const { data: isAdmin } = await (supabase.rpc as any)("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (isAdmin) return "admin";

      // Check organization role (owner/admin in organization_members)
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (orgMember?.role === "owner" || orgMember?.role === "admin") {
        return "admin";
      }

      return "user";
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
}
