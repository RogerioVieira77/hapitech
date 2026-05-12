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
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas error:", JSON.stringify(data));
    throw new Error(data.errors?.[0]?.description || "Asaas API error");
  }
  return data;
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
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Get user's asaas subscriptions to find customer ID
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs } = await supabaseAdmin
      .from("asaas_subscriptions")
      .select("asaas_customer_id, asaas_subscription_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ invoices: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerId = subs[0].asaas_customer_id;

    // Fetch payments from Asaas for this customer
    const payments = await asaasFetch(
      `/payments?customer=${customerId}&limit=50&offset=0`
    );

    // Map Asaas payments to our invoice format
    const statusMap: Record<string, string> = {
      CONFIRMED: "paid",
      RECEIVED: "paid",
      RECEIVED_IN_CASH: "paid",
      PENDING: "pending",
      AWAITING_RISK_ANALYSIS: "pending",
      OVERDUE: "overdue",
      REFUNDED: "refunded",
      REFUND_REQUESTED: "refunded",
      CHARGEBACK_REQUESTED: "refunded",
      CHARGEBACK_DISPUTE: "refunded",
      AWAITING_CHARGEBACK_REVERSAL: "refunded",
    };

    const invoices = (payments.data || []).map((p: any) => ({
      id: p.id,
      number: p.invoiceNumber || p.id.slice(0, 12).toUpperCase(),
      date: p.dateCreated || p.paymentDate,
      dueDate: p.dueDate,
      status: statusMap[p.status] || "pending",
      description: p.description || "Assinatura",
      value: p.value || 0,
      netValue: p.netValue || p.value || 0,
      billingType: p.billingType,
      invoiceUrl: p.invoiceUrl || null,
      bankSlipUrl: p.bankSlipUrl || null,
      pixQrCode: p.pixQrCodeUrl || null,
      transactionReceiptUrl: p.transactionReceiptUrl || null,
    }));

    return new Response(
      JSON.stringify({ invoices }),
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
