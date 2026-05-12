import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_BASE = ASAAS_API_KEY?.startsWith("$aact_prod")
  ? "https://api.asaas.com/v3"
  : "https://sandbox.asaas.com/api/v3";

async function asaasFetch(path: string) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    headers: { "Content-Type": "application/json", access_token: ASAAS_API_KEY },
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get latest pending/active subscription for user
    const { data: subs, error: subErr } = await supabaseAdmin
      .from("asaas_subscriptions")
      .select("*, plan:plans(*)")
      .eq("user_id", userId)
      .in("status", ["pending", "active", "overdue"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (subErr || !subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ error: "no_subscription", message: "Nenhuma assinatura encontrada." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sub = subs[0];
    const plan = sub.plan;

    // Check payments on Asaas for this subscription
    const payments = await asaasFetch(
      `/subscriptions/${sub.asaas_subscription_id}/payments`
    );

    if (!payments.data || payments.data.length === 0) {
      return new Response(
        JSON.stringify({ synced: false, message: "Nenhum pagamento encontrado no Asaas." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the latest confirmed payment
    const confirmedPayment = payments.data.find(
      (p: any) => p.status === "CONFIRMED" || p.status === "RECEIVED"
    );

    if (!confirmedPayment) {
      // Check if there's a pending payment
      const pendingPayment = payments.data.find((p: any) => p.status === "PENDING");
      return new Response(
        JSON.stringify({
          synced: false,
          status: pendingPayment ? "pending" : "no_confirmed",
          message: pendingPayment
            ? "Pagamento ainda pendente. Aguarde a confirmação."
            : "Nenhum pagamento confirmado encontrado.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Payment is confirmed — activate subscription
    const now = new Date();
    const periodMonths: Record<string, number> = {
      mensal: 1, trimestral: 3, semestral: 6, anual: 12,
    };
    const months = periodMonths[sub.billing_cycle] || 1;
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + months);

    // Update organization
    await supabaseAdmin
      .from("organizations")
      .update({
        plan_id: sub.plan_id,
        subscription_status: "active",
        billing_period: sub.billing_cycle,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", sub.organization_id);

    // Update subscription status
    await supabaseAdmin
      .from("asaas_subscriptions")
      .update({ status: "active", updated_at: now.toISOString() })
      .eq("id", sub.id);

    // Add credits if not already added (check if already credited for this sub)
    if (plan?.monthly_credits && sub.status !== "active") {
      const { data: credits } = await supabaseAdmin
        .from("user_credits")
        .select("balance")
        .eq("user_id", userId)
        .single();

      const currentBalance = credits?.balance || 0;
      const newBalance = currentBalance + plan.monthly_credits;

      await supabaseAdmin
        .from("user_credits")
        .upsert({
          user_id: userId,
          balance: newBalance,
          updated_at: now.toISOString(),
        }, { onConflict: "user_id" });

      await supabaseAdmin.from("credit_transactions").insert({
        user_id: userId,
        amount: plan.monthly_credits,
        balance_after: newBalance,
        type: "credit",
        description: `Créditos do plano ${plan.name} - sync manual`,
      });

      console.log(`Sync: Added ${plan.monthly_credits} credits to user ${userId}`);
    }

    // Notification
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: "Plano sincronizado ✅",
      message: `Seu plano ${plan?.name} foi ativado com sucesso!`,
      type: "billing",
    });

    return new Response(
      JSON.stringify({
        synced: true,
        plan: plan?.name,
        status: "active",
        message: `Plano ${plan?.name} ativado com sucesso!`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Sync error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
