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

async function asaasFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas error:", JSON.stringify(data));
    throw new Error(data.errors?.[0]?.description || "Asaas API error");
  }
  return data;
}

async function findOrCreateCustomer(email: string, name: string, cpfCnpj: string) {
  const search = await asaasFetch(`/customers?email=${encodeURIComponent(email)}`);
  if (search.data && search.data.length > 0) {
    const existing = search.data[0];
    // Update cpfCnpj if missing on existing customer
    if (!existing.cpfCnpj && cpfCnpj) {
      await asaasFetch(`/customers/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify({ cpfCnpj }),
      });
    }
    return existing.id;
  }
  const customer = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: name || email.split("@")[0],
      email,
      cpfCnpj,
      notificationDisabled: false,
    }),
  });
  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = claimsData.user;
    const body = await req.json();
    const { plan_id, billing_cycle, cpf_cnpj } = body;

    if (!plan_id || !billing_cycle) {
      return new Response(
        JSON.stringify({ error: "plan_id and billing_cycle are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!cpf_cnpj) {
      return new Response(
        JSON.stringify({ error: "CPF ou CNPJ é obrigatório para criar a cobrança." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean cpf/cnpj - only digits
    const cleanCpfCnpj = cpf_cnpj.replace(/\D/g, "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: "Plan not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const discountMap: Record<string, number> = {
      mensal: 1, trimestral: 0.95, semestral: 0.93, anual: 0.9,
    };
    const cycleMonthsMap: Record<string, string> = {
      mensal: "MONTHLY", trimestral: "QUARTERLY", semestral: "SEMIANNUALLY", anual: "YEARLY",
    };

    const discount = discountMap[billing_cycle] || 1;
    const monthlyPrice = Math.round(plan.monthly_price * discount * 100) / 100;
    const asaasCycle = cycleMonthsMap[billing_cycle] || "MONTHLY";

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    // Get user org
    const { data: orgMember } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const customerId = await findOrCreateCustomer(
      user.email!,
      profile?.display_name || user.email!.split("@")[0],
      cleanCpfCnpj
    );

    // Create subscription - use short externalReference (max 100 chars)
    const subscription = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED",
        value: monthlyPrice,
        cycle: asaasCycle,
        description: `${plan.name} - ${billing_cycle}`,
        externalReference: user.id,
      }),
    });

    // Save subscription mapping in our DB
    if (subscription.id && orgMember?.organization_id) {
      await supabaseAdmin.from("asaas_subscriptions").insert({
        organization_id: orgMember.organization_id,
        user_id: user.id,
        plan_id: plan.id,
        asaas_subscription_id: subscription.id,
        asaas_customer_id: customerId,
        billing_cycle,
        status: "pending",
      });
    }

    // Get payment link
    let paymentUrl = "";
    if (subscription.id) {
      const payments = await asaasFetch(
        `/subscriptions/${subscription.id}/payments?status=PENDING`
      );
      if (payments.data && payments.data.length > 0) {
        paymentUrl = payments.data[0].invoiceUrl || payments.data[0].bankSlipUrl || "";
      }
    }

    if (!paymentUrl && subscription.id) {
      paymentUrl = `${ASAAS_BASE.replace("/api/v3", "").replace("/v3", "")}/i/${subscription.id}`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: subscription.id,
        payment_url: paymentUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
