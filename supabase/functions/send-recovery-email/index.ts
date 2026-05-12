import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getGmailAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Failed to refresh Gmail token: ${errText}`);
  }
  const data = await resp.json();
  return data.access_token;
}

async function sendViaGmailApi(accessToken: string, from: string, fromName: string, to: string, subject: string, htmlBody: string) {
  // Build raw MIME message
  const boundary = "boundary_" + Date.now();
  const rawMessage = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    htmlBody,
  ].join("\r\n");

  // Base64url encode
  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gmail API error: ${errText}`);
  }
  return await resp.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { email } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return new Response(JSON.stringify({ error: "Email é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Recovery requested for: ${normalizedEmail}`);

    // Get SMTP/OAuth settings
    const { data: settings } = await adminClient
      .from("smtp_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const origin = req.headers.get("origin") || req.headers.get("referer") || "https://conversational-iq-suite.lovable.app";
    const baseOrigin = origin.replace(/\/$/, "");

    console.log("Generating recovery link...");

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo: `${baseOrigin}/reset-password` },
    });

    if (linkError) {
      const msg = (linkError.message || "").toLowerCase();
      if (msg.includes("user not found") || msg.includes("email not found")) {
        console.log(`User not found for email: ${normalizedEmail} — returning silent success`);
        return new Response(JSON.stringify({ success: true, method: "silent" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("generateLink error:", linkError);
      throw linkError;
    }

    const recoveryLink = linkData?.properties?.action_link;

    // Generate 6-digit verification code
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));

    // Store code in database
    const { error: insertError } = await adminClient.from("recovery_codes").insert({
      email: normalizedEmail,
      code: verificationCode,
      recovery_link: recoveryLink || "",
    });
    if (insertError) {
      console.error("Failed to store recovery code:", insertError);
      throw new Error("Falha ao salvar código de recuperação");
    }
    console.log("Recovery code stored successfully:", verificationCode);

    // Get user display name from profile
    const { data: profileData } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("user_id", linkData.user.id)
      .single();

    const accountName = profileData?.display_name || linkData.user.email?.split("@")[0] || "Usuário";

    // Send webhook with 6-digit code
    const webhookUrl = Deno.env.get("RECOVERY_WEBHOOK_URL");
    if (webhookUrl) {
      try {
        console.log("Sending recovery webhook to:", webhookUrl);
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: normalizedEmail,
            codigo_verificacao: verificationCode,
          }),
        });
        console.log("Recovery webhook sent successfully");
      } catch (whErr: any) {
        console.error("Webhook error (non-blocking):", whErr.message);
      }
    }
    if (!recoveryLink) throw new Error("Não foi possível gerar o link de recuperação");

    console.log("Recovery link generated successfully");

    const senderName = settings?.sender_name || "Meu Vendedor Online";
    const senderEmail = settings?.sender_email || settings?.smtp_user || settings?.gmail_oauth_email || "noreply@meuvendedoronline.com";

    const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f6f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Meu Vendedor Online</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;font-weight:700;">Redefinir senha</h2>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${recoveryLink}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:600;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
                Se você não solicitou esta alteração, ignore este e-mail. O link expira em 1 hora.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#f9fafb;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                © ${new Date().getFullYear()} Meu Vendedor Online. Todos os direitos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // METHOD 1: Gmail OAuth API
    if (settings?.use_gmail_oauth && settings?.gmail_oauth_refresh_token) {
      console.log("Sending via Gmail OAuth API...");
      const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
      const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

      const accessToken = await getGmailAccessToken(
        settings.gmail_oauth_refresh_token,
        googleClientId,
        googleClientSecret
      );

      await sendViaGmailApi(
        accessToken,
        settings.gmail_oauth_email || senderEmail,
        senderName,
        email,
        "Redefinir sua senha - Meu Vendedor Online",
        htmlEmail
      );

      console.log("Gmail OAuth email sent successfully");
      return new Response(JSON.stringify({ success: true, method: "gmail_oauth" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // METHOD 2: Custom SMTP
    if (settings?.is_active && settings?.smtp_user && settings?.smtp_pass) {
      console.log(`Sending via SMTP: ${settings.smtp_host}:${settings.smtp_port}`);
      const { SmtpClient } = await import("https://deno.land/x/smtp@v0.7.0/mod.ts");
      const client = new SmtpClient();

      const connectConfig = {
        hostname: settings.smtp_host,
        port: settings.smtp_port,
        username: settings.smtp_user,
        password: settings.smtp_pass,
      };

      if (settings.smtp_port === 465) {
        await client.connectTLS(connectConfig);
      } else {
        await client.connect(connectConfig);
      }

      await client.send({
        from: `${senderName} <${senderEmail}>`,
        to: email,
        subject: "Redefinir sua senha - Meu Vendedor Online",
        content: "text/html",
        html: htmlEmail,
      });

      await client.close();
      console.log("SMTP email sent successfully");

      return new Response(JSON.stringify({ success: true, method: "smtp" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // METHOD 3: Fallback to Supabase default
    console.log("No custom email config active, using Supabase default recovery");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey);
    await anonClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseOrigin}/reset-password`,
    });

    return new Response(JSON.stringify({ success: true, method: "supabase" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Recovery email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
