import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Send WhatsApp message via Evolution API
async function sendWhatsAppMessage(
  evoUrl: string,
  evoKey: string,
  instanceName: string,
  remoteJid: string,
  text: string,
): Promise<void> {
  try {
    await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ number: remoteJid, text }),
    });
  } catch (e) {
    console.error("Failed to send WhatsApp message:", e);
  }
}

// Send Telegram message
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch (e) {
    console.error("Failed to send Telegram message:", e);
  }
}

// Fire webhook rules for a given event
async function fireWebhookRules(
  webhookRules: Array<{ event: string; url: string }> | null | undefined,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!webhookRules || !Array.isArray(webhookRules)) return;
  const matching = webhookRules.filter(r => r.event === eventType && r.url);
  for (const rule of matching) {
    try {
      console.log(`[webhook-rule] Firing ${eventType} -> ${rule.url}`);
      await fetch(rule.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), ...payload }),
      });
    } catch (e) {
      console.error(`[webhook-rule] Failed to fire ${eventType}:`, e);
    }
  }
}

interface InactivityRule {
  id: number;
  minutes: number;
  action: string; // "finalizar" | "transferir" | "mensagem"
  message?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const evoUrl = Deno.env.get("EVO_URL")?.replace(/\/$/, "") || "";
    const evoKey = Deno.env.get("EVO_KEY") || "";

    // 1. Find all active agents with inactivity_rules configured
    const { data: agents, error: agentsErr } = await supabase
      .from("agents")
      .select("id, name, user_id, connection_id, telegram_connection_id, inactivity_rules, webhook_rules")
      .eq("status", "active")
      .not("inactivity_rules", "is", null);

    if (agentsErr) {
      console.error("Error fetching agents:", agentsErr);
      return new Response(JSON.stringify({ error: agentsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter agents that actually have rules
    const agentsWithRules = (agents || []).filter((a) => {
      const rules = a.inactivity_rules;
      return Array.isArray(rules) && rules.length > 0;
    });

    if (agentsWithRules.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No agents with inactivity rules" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processedCount = 0;
    let actionsExecuted = 0;

    for (const agent of agentsWithRules) {
      const rules: InactivityRule[] = Array.isArray(agent.inactivity_rules)
        ? agent.inactivity_rules
        : [];

      if (rules.length === 0) continue;

      // Sort rules by minutes descending so we trigger the longest-waiting rule first
      const sortedRules = [...rules].sort((a, b) => b.minutes - a.minutes);

      // 2. Find conversations for this agent where last message was from user and AI is active
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id, remote_jid, last_message_at, last_message_sender, is_ai_active, connection_id, contact_name")
        .eq("agent_id", agent.id)
        .eq("is_ai_active", true)
        .eq("last_message_sender", "user")
        .not("last_message_at", "is", null);

      if (!conversations || conversations.length === 0) continue;

      const now = new Date();

      for (const convo of conversations) {
        const lastMsgAt = new Date(convo.last_message_at);
        const minutesSinceLastMsg = (now.getTime() - lastMsgAt.getTime()) / 60000;

        // Find the matching rule (first rule where enough time has passed)
        const matchedRule = sortedRules.find((r) => minutesSinceLastMsg >= r.minutes);
        if (!matchedRule) continue;

        processedCount++;

        // Determine the channel (WhatsApp or Telegram)
        const isWhatsApp = convo.remote_jid?.includes("@s.whatsapp.net") || convo.remote_jid?.includes("@c.us");
        const isTelegram = convo.remote_jid?.startsWith("tg_");

        console.log(
          `[inactivity] Conversation ${convo.id} inactive ${Math.floor(minutesSinceLastMsg)}min, rule: ${matchedRule.action} (${matchedRule.minutes}min)`
        );

        // Execute action
        if (matchedRule.action === "finalizar") {
          // Deactivate AI and send farewell message
          await supabase
            .from("conversations")
            .update({ is_ai_active: false, last_message_sender: "agent" })
            .eq("id", convo.id);

          const farewellMsg = matchedRule.message || "Atendimento finalizado por inatividade. Se precisar, é só enviar uma nova mensagem!";

          if (isWhatsApp && convo.connection_id) {
            const { data: conn } = await supabase
              .from("wuzapi_connections")
              .select("phone_number")
              .eq("id", convo.connection_id)
              .maybeSingle();
            if (conn?.phone_number && evoUrl && evoKey) {
              await sendWhatsAppMessage(evoUrl, evoKey, conn.phone_number, convo.remote_jid, farewellMsg);
            }
          } else if (isTelegram && agent.telegram_connection_id) {
            const { data: tgConn } = await supabase
              .from("telegram_connections")
              .select("bot_token")
              .eq("id", agent.telegram_connection_id)
              .maybeSingle();
            if (tgConn?.bot_token) {
              const chatId = convo.remote_jid.replace("tg_", "");
              await sendTelegramMessage(tgConn.bot_token, chatId, farewellMsg);
            }
          }

          // Insert message record
          await supabase.from("messages").insert({
            user_id: agent.user_id,
            conversation_id: convo.id,
            remote_jid: convo.remote_jid,
            content: farewellMsg,
            sender: "agent",
            message_id: `inactivity_${Date.now()}_${convo.id}`,
          });

          // Update conversation last message
          await supabase.from("conversations").update({
            last_message: farewellMsg,
            last_message_at: new Date().toISOString(),
            last_message_sender: "agent",
          }).eq("id", convo.id);

          actionsExecuted++;

        } else if (matchedRule.action === "transferir") {
          // Deactivate AI (transfer to human)
          await supabase
            .from("conversations")
            .update({ is_ai_active: false, last_message_sender: "agent" })
            .eq("id", convo.id);

          const transferMsg = matchedRule.message || "Transferindo para um atendente humano. Aguarde um momento.";

          if (isWhatsApp && convo.connection_id) {
            const { data: conn } = await supabase
              .from("wuzapi_connections")
              .select("phone_number")
              .eq("id", convo.connection_id)
              .maybeSingle();
            if (conn?.phone_number && evoUrl && evoKey) {
              await sendWhatsAppMessage(evoUrl, evoKey, conn.phone_number, convo.remote_jid, transferMsg);
            }
          } else if (isTelegram && agent.telegram_connection_id) {
            const { data: tgConn } = await supabase
              .from("telegram_connections")
              .select("bot_token")
              .eq("id", agent.telegram_connection_id)
              .maybeSingle();
            if (tgConn?.bot_token) {
              const chatId = convo.remote_jid.replace("tg_", "");
              await sendTelegramMessage(tgConn.bot_token, chatId, transferMsg);
            }
          }

          await supabase.from("messages").insert({
            user_id: agent.user_id,
            conversation_id: convo.id,
            remote_jid: convo.remote_jid,
            content: transferMsg,
            sender: "agent",
            message_id: `inactivity_transfer_${Date.now()}_${convo.id}`,
          });

          await supabase.from("conversations").update({
            last_message: transferMsg,
            last_message_at: new Date().toISOString(),
            last_message_sender: "agent",
          }).eq("id", convo.id);

          // Fire transferencia webhook
          fireWebhookRules((agent as any).webhook_rules, "transferencia", {
            contact_name: convo.contact_name, remote_jid: convo.remote_jid,
            conversation_id: convo.id, agent_id: agent.id, reason: "inactivity",
            channel: isWhatsApp ? "whatsapp" : isTelegram ? "telegram" : "unknown",
          });

          actionsExecuted++;

        } else if (matchedRule.action === "mensagem") {
          const customMsg = matchedRule.message || "Olá! Percebi que você ficou ausente. Posso ajudar em algo mais?";

          if (isWhatsApp && convo.connection_id) {
            const { data: conn } = await supabase
              .from("wuzapi_connections")
              .select("phone_number")
              .eq("id", convo.connection_id)
              .maybeSingle();
            if (conn?.phone_number && evoUrl && evoKey) {
              await sendWhatsAppMessage(evoUrl, evoKey, conn.phone_number, convo.remote_jid, customMsg);
            }
          } else if (isTelegram && agent.telegram_connection_id) {
            const { data: tgConn } = await supabase
              .from("telegram_connections")
              .select("bot_token")
              .eq("id", agent.telegram_connection_id)
              .maybeSingle();
            if (tgConn?.bot_token) {
              const chatId = convo.remote_jid.replace("tg_", "");
              await sendTelegramMessage(tgConn.bot_token, chatId, customMsg);
            }
          }

          await supabase.from("messages").insert({
            user_id: agent.user_id,
            conversation_id: convo.id,
            remote_jid: convo.remote_jid,
            content: customMsg,
            sender: "agent",
            message_id: `inactivity_msg_${Date.now()}_${convo.id}`,
          });

          // Update last message to agent so we don't re-trigger
          await supabase.from("conversations").update({
            last_message: customMsg,
            last_message_at: new Date().toISOString(),
            last_message_sender: "agent",
          }).eq("id", convo.id);

          actionsExecuted++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: processedCount, actions: actionsExecuted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("check-inactivity error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
