import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";

export interface Plan {
  id: string;
  slug: string;
  name: string;
  monthly_price: number;
  monthly_credits: number;
  max_agents: number;
  max_connections: number;
  max_members: number;
  features: string[];
  is_active: boolean;
  position: number;
  popular: boolean;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  billing_period: string;
  created_at: string;
  plan?: Plan;
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans" as any)
        .select("*")
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return (data as any[]) as Plan[];
    },
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
}

export function useAllPlans() {
  return useQuery({
    queryKey: ["all-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans" as any)
        .select("*")
        .order("position");
      if (error) throw error;
      return (data as any[]) as Plan[];
    },
  });
}

export function useUserSubscription() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-subscription", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_subscriptions" as any)
        .select("*, plan:plans(*)")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as UserSubscription | null;
    },
    enabled: !!user,
  });
}

export function usePlanLimits() {
  const { user } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useOrganization();

  const org = orgData?.org;
  const orgPlan = orgData?.plan as Plan | undefined;
  const hasOrgPlan = !!org && !!orgPlan && org.subscription_status === "active";

  // Fallback to individual subscription if no org plan
  const { data: subscription, isLoading: subLoading } = useUserSubscription();

  const plan = hasOrgPlan ? orgPlan : (subscription?.plan as Plan | undefined);

  const { data: agentCount, isLoading: agentLoading } = useQuery({
    queryKey: ["agent-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("agents")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  const { data: connectionCount, isLoading: connLoading } = useQuery({
    queryKey: ["connection-count", user?.id],
    queryFn: async () => {
      const [wuzapi, telegram, widget] = await Promise.all([
        supabase.from("wuzapi_connections").select("*", { count: "exact", head: true }),
        supabase.from("telegram_connections").select("*", { count: "exact", head: true }),
        supabase.from("widget_connections").select("*", { count: "exact", head: true }),
      ]);
      return (wuzapi.count ?? 0) + (telegram.count ?? 0) + (widget.count ?? 0);
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });

  return {
    plan,
    subscription: hasOrgPlan ? null : subscription,
    org,
    isLoading: orgLoading || subLoading || agentLoading || connLoading,
    hasPlan: hasOrgPlan || !!subscription,
    // Limits
    maxAgents: plan?.max_agents ?? 1,
    currentAgents: agentCount ?? 0,
    canCreateAgent: (agentCount ?? 0) < (plan?.max_agents ?? 1),
    maxConnections: plan?.max_connections ?? 1,
    currentConnections: connectionCount ?? 0,
    canCreateConnection: (connectionCount ?? 0) < (plan?.max_connections ?? 1),
    maxMembers: plan?.max_members ?? 5,
    monthlyCredits: plan?.monthly_credits ?? 0,
    features: plan?.features ?? [],
    hasFeature: (feature: string) => plan?.features?.includes(feature) ?? false,
  };
}
