import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawText = await req.text();
    if (!rawText || rawText.trim() === "") {
      console.log("Empty body received (likely Asaas test ping)");
      return new Response(JSON.stringify({ received: true, ping: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = JSON.parse(rawText);
    } catch {
      console.log("Invalid JSON body:", rawText.substring(0, 200));
      return new Response(JSON.stringify({ received: true, error: "invalid_json" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { event, payment } = body;

    console.log("Asaas webhook received:", event, payment?.id);

    const confirmedEvents = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"];
    const overdueEvents = ["PAYMENT_OVERDUE"];
    const deletedEvents = ["SUBSCRIPTION_DELETED", "SUBSCRIPTION_EXPIRED"];
    const allHandled = [...confirmedEvents, ...overdueEvents, ...deletedEvents];

    if (!allHandled.includes(event)) {
      console.log("Event ignored:", event);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For payment events we need a subscription reference
    const subscriptionId = payment?.subscription || body?.subscription?.id;
    if (!subscriptionId) {
      console.log("No subscription reference, ignoring");
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find subscription in our DB
    const { data: sub, error: subError } = await supabaseAdmin
      .from("asaas_subscriptions")
      .select("*, plan:plans(*)")
      .eq("asaas_subscription_id", subscriptionId)
      .single();

    if (subError || !sub) {
      console.error("Subscription not found:", subscriptionId, subError?.message);
      return new Response(JSON.stringify({ received: true, warning: "subscription_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const plan = sub.plan;
    const now = new Date();

    // ── OVERDUE: suspend subscription ──
    if (overdueEvents.includes(event)) {
      console.log("Payment overdue for subscription:", subscriptionId);

      await supabaseAdmin
        .from("asaas_subscriptions")
        .update({ status: "overdue", updated_at: now.toISOString() })
        .eq("id", sub.id);

      await supabaseAdmin
        .from("organizations")
        .update({
          subscription_status: "past_due",
          updated_at: now.toISOString(),
        })
        .eq("id", sub.organization_id);

      await supabaseAdmin.from("notifications").insert({
        user_id: sub.user_id,
        title: "Pagamento atrasado ⚠️",
        message: `O pagamento do seu plano ${plan?.name} está atrasado. Regularize para manter o acesso.`,
        type: "billing",
      });

      console.log("Subscription marked as overdue:", subscriptionId);
      return new Response(
        JSON.stringify({ received: true, processed: true, action: "overdue" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DELETED / EXPIRED: cancel subscription, downgrade to free ──
    if (deletedEvents.includes(event)) {
      console.log("Subscription deleted/expired:", subscriptionId);

      await supabaseAdmin
        .from("asaas_subscriptions")
        .update({ status: "cancelled", updated_at: now.toISOString() })
        .eq("id", sub.id);

      // Find the free plan
      const { data: freePlan } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("slug", "free")
        .single();

      await supabaseAdmin
        .from("organizations")
        .update({
          subscription_status: "cancelled",
          plan_id: freePlan?.id || null,
          billing_period: "mensal",
          current_period_end: null,
          updated_at: now.toISOString(),
        })
        .eq("id", sub.organization_id);

      await supabaseAdmin.from("notifications").insert({
        user_id: sub.user_id,
        title: "Assinatura cancelada ❌",
        message: `Seu plano ${plan?.name} foi cancelado. Você foi movido para o plano Free.`,
        type: "billing",
      });

      console.log("Subscription cancelled, downgraded to free:", subscriptionId);
      return new Response(
        JSON.stringify({ received: true, processed: true, action: "cancelled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── CONFIRMED: activate subscription & add credits ──
    const periodMonths: Record<string, number> = {
      mensal: 1, trimestral: 3, semestral: 6, anual: 12,
    };
    const months = periodMonths[sub.billing_cycle] || 1;
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + months);

    const { error: orgError } = await supabaseAdmin
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

    if (orgError) console.error("Error updating organization:", orgError.message);

    await supabaseAdmin
      .from("asaas_subscriptions")
      .update({ status: "active", updated_at: now.toISOString() })
      .eq("id", sub.id);

    if (plan?.monthly_credits) {
      const { data: credits } = await supabaseAdmin
        .from("user_credits")
        .select("balance")
        .eq("user_id", sub.user_id)
        .single();

      const currentBalance = credits?.balance || 0;
      const newBalance = currentBalance + plan.monthly_credits;

      await supabaseAdmin
        .from("user_credits")
        .upsert({
          user_id: sub.user_id,
          balance: newBalance,
          updated_at: now.toISOString(),
        }, { onConflict: "user_id" });

      await supabaseAdmin.from("credit_transactions").insert({
        user_id: sub.user_id,
        amount: plan.monthly_credits,
        balance_after: newBalance,
        type: "credit",
        description: `Créditos do plano ${plan.name} - ${sub.billing_cycle}`,
      });

      console.log(`Added ${plan.monthly_credits} credits to user ${sub.user_id}`);
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: sub.user_id,
      title: "Pagamento confirmado! ✅",
      message: `Seu plano ${plan?.name} foi ativado com sucesso. ${plan?.monthly_credits?.toLocaleString()} créditos foram adicionados.`,
      type: "billing",
    });

    console.log("Webhook processed successfully for subscription:", subscriptionId);

    return new Response(
      JSON.stringify({ received: true, processed: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
