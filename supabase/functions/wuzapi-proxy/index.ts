import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    // Get Evolution API credentials from secrets (with fallback defaults)
    const evoUrl = Deno.env.get("EVO_URL") || "https://evo-api.meuvendedoronline.com.br";
    const evoKey = Deno.env.get("EVO_KEY") || "WNP0Qd5UqOjgtTnoYQMwhlSCUE5YPNA6";

    if (!evoUrl || !evoKey) {
      return new Response(
        JSON.stringify({ error: "Evolution API não configurada no servidor. Configure EVO_URL e EVO_KEY." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, instanceName, connectionId, body } = await req.json();

    const baseUrl = evoUrl.replace(/\/$/, "");
    const instName = (instanceName || "default")
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '') || "default";

    // Save instance config in DB (allows multiple per user)
    if (action === "save-config") {
      const { data, error } = await supabase
        .from("wuzapi_connections")
        .insert({
          user_id: user.id,
          instance_url: baseUrl,
          api_token: "managed",
          phone_number: instName,
        })
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-config") {
      if (!connectionId) throw new Error("connectionId required");
      
      const serviceRoleForDelete = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      // Unlink agents referencing this connection before deleting
      await serviceRoleForDelete
        .from("agents")
        .update({ connection_id: null })
        .eq("connection_id", connectionId);
      
      // Unlink conversations referencing this connection before deleting
      await serviceRoleForDelete
        .from("conversations")
        .update({ connection_id: null })
        .eq("connection_id", connectionId);
      
      const { error } = await serviceRoleForDelete
        .from("wuzapi_connections")
        .delete()
        .eq("id", connectionId);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For other actions, we need a connectionId to identify which instance
    // Allow any member of the same organization to use the connection
    const serviceRole = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get all org member user IDs for authorization check
    const { data: orgId } = await serviceRole.rpc("get_user_org_id", { _user_id: user.id });
    let orgUserIds: string[] = [user.id];
    if (orgId) {
      const { data: members } = await serviceRole
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId);
      if (members) orgUserIds = members.map((m: any) => m.user_id);
    }

    let currentInstName = instName;
    if (connectionId) {
      const { data: conn } = await serviceRole
        .from("wuzapi_connections")
        .select("*")
        .eq("id", connectionId)
        .in("user_id", orgUserIds)
        .single();

      if (!conn) {
        // Connection not found — return graceful responses instead of 400 errors
        if (action === "status" || action === "connect" || action === "restart") {
          return new Response(
            JSON.stringify({ instance: { state: "close", instanceName: "unknown" } }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (action === "fetch-profile" || action === "fetch-instances") {
          return new Response(JSON.stringify([]), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (action === "logout" || action === "delete-instance") {
          return new Response(JSON.stringify({ success: true, message: "Instance already removed" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ error: "Instância não encontrada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      currentInstName = (conn.phone_number || "default")
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '') || "default";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: evoKey,
    };

    let endpoint = "";
    let method = "GET";
    let fetchBody: string | undefined;

    switch (action) {
      case "create-instance": {
        endpoint = `/instance/create`;
        method = "POST";
        fetchBody = JSON.stringify({
          instanceName: currentInstName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        });

        const createResp = await fetch(`${baseUrl}${endpoint}`, {
          method: "POST",
          headers,
          body: fetchBody,
        });
        const createData = await createResp.json();
        console.log(`Instance created [${createResp.status}]:`, JSON.stringify(createData).substring(0, 500));

        // If creation failed, return error in body but with 200 status
        if (!createResp.ok) {
          const errorMessage = createData?.message || createData?.error || `Erro ao criar instância (${createResp.status})`;
          // If instance already exists (409), try to connect instead
          if (createResp.status === 409) {
            console.log(`Instance ${currentInstName} already exists, attempting to connect...`);
            try {
              const connectResp = await fetch(`${baseUrl}/instance/connect/${currentInstName}`, {
                method: "GET",
                headers,
              });
              const connectData = await connectResp.json();
              if (connectResp.ok && (connectData?.base64 || connectData?.qrcode?.base64)) {
                return new Response(JSON.stringify({
                  ...connectData,
                  message: "Instância já existe. QR Code gerado.",
                }), {
                  status: 200,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }
            } catch (connectErr) {
              console.error("Failed to connect existing instance:", connectErr);
            }
          }
          return new Response(JSON.stringify({
            error: errorMessage,
            status: createResp.status,
            data: createData,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Set webhook AFTER instance creation (only if creation was successful)
        const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
        try {
          await new Promise(r => setTimeout(r, 1500));
          // Try v2 format first, then v1 fallback
          let whResp = await fetch(`${baseUrl}/webhook/set/${currentInstName}`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              webhook: {
                enabled: true,
                url: webhookUrl,
                byEvents: false,
                base64: false,
                events: ["MESSAGES_UPSERT"],
              },
            }),
          });
          
          if (!whResp.ok) {
            console.log(`Webhook v2 format failed [${whResp.status}], trying v1 format...`);
            // v1 format: flat body, endpoint /webhook/instance
            whResp = await fetch(`${baseUrl}/webhook/instance/${currentInstName}`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                enabled: true,
                url: webhookUrl,
                webhook_by_events: false,
                webhook_base64: false,
                events: ["MESSAGES_UPSERT"],
              }),
            });
          }
          
          const whData = await whResp.json();
          console.log(`Webhook set [${whResp.status}]:`, JSON.stringify(whData).substring(0, 300));
        } catch (whErr) {
          console.error("Failed to set webhook:", whErr);
        }

        // Update connection status
        if (connectionId) {
          const state = createData?.instance?.state;
          const connected = state === "open";
          await serviceRole
            .from("wuzapi_connections")
            .update({ is_connected: connected })
            .eq("id", connectionId);
        }

        return new Response(JSON.stringify(createData), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "connect": {
        endpoint = `/instance/connect/${currentInstName}`;
        method = "GET";
        
        // Fetch connect response first
        let connectResp = await fetch(`${baseUrl}${endpoint}`, { method: "GET", headers });
        let connectData = await connectResp.json();
        console.log(`Connect response [${connectResp.status}]:`, JSON.stringify(connectData).substring(0, 500));

        // If instance doesn't exist, auto-create it then reconnect
        if (connectResp.status === 404) {
          console.log(`Instance ${currentInstName} not found, auto-creating...`);
          const createResp2 = await fetch(`${baseUrl}/instance/create`, {
            method: "POST",
            headers,
            body: JSON.stringify({ instanceName: currentInstName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
          });
          const createData2 = await createResp2.json();
          console.log(`Auto-create instance [${createResp2.status}]:`, JSON.stringify(createData2).substring(0, 500));

          // Wait for instance to initialize
          await new Promise(r => setTimeout(r, 2000));

          // Try connect again
          connectResp = await fetch(`${baseUrl}${endpoint}`, { method: "GET", headers });
          connectData = await connectResp.json();
          console.log(`Reconnect after create [${connectResp.status}]:`, JSON.stringify(connectData).substring(0, 500));

          // If still failing, return the create response (which has qrcode)
          if (connectResp.status === 404 && createData2?.qrcode?.base64) {
            connectData = createData2;
            connectResp = createResp2;
          }
        }

        // Auto-set webhook on connect
        const whUrlConnect = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
        try {
          await new Promise(r => setTimeout(r, 1000));
          let whResp = await fetch(`${baseUrl}/webhook/set/${currentInstName}`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              webhook: { enabled: true, url: whUrlConnect, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] },
            }),
          });
          if (!whResp.ok) {
            whResp = await fetch(`${baseUrl}/webhook/instance/${currentInstName}`, {
              method: "POST",
              headers,
              body: JSON.stringify({ enabled: true, url: whUrlConnect, webhook_by_events: false, webhook_base64: false, events: ["MESSAGES_UPSERT"] }),
            });
          }
          const whData = await whResp.json();
          console.log(`Webhook auto-set on connect [${whResp.status}]:`, JSON.stringify(whData).substring(0, 300));
        } catch (whErr) {
          console.error("Failed to auto-set webhook on connect:", whErr);
        }

        // Update connection status
        if (connectionId) {
          const state = connectData?.instance?.state || connectData?.state;
          const connected = state === "open";
          await serviceRole
            .from("wuzapi_connections")
            .update({ is_connected: connected })
            .eq("id", connectionId);
        }

        return new Response(JSON.stringify(connectData), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "status": {
        endpoint = `/instance/connectionState/${currentInstName}`;
        const statusResp = await fetch(`${baseUrl}${endpoint}`, { method: "GET", headers });
        const statusData = await statusResp.json();
        console.log(`Status response [${statusResp.status}]:`, JSON.stringify(statusData).substring(0, 500));

        // If instance doesn't exist yet, return disconnected state gracefully
        if (statusResp.status === 404) {
          if (connectionId) {
          await serviceRole
            .from("wuzapi_connections")
            .update({ is_connected: false })
            .eq("id", connectionId);
          }
          return new Response(JSON.stringify({ instance: { state: "close", instanceName: currentInstName } }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const stateVal = statusData?.instance?.state || statusData?.state;
        // Auto-set webhook when status is open
        if (stateVal === "open") {
          const whUrlStatus = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
          try {
            let whResp = await fetch(`${baseUrl}/webhook/set/${currentInstName}`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                webhook: { enabled: true, url: whUrlStatus, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] },
              }),
            });
            if (!whResp.ok) {
              whResp = await fetch(`${baseUrl}/webhook/instance/${currentInstName}`, {
                method: "POST",
                headers,
                body: JSON.stringify({ enabled: true, url: whUrlStatus, webhook_by_events: false, webhook_base64: false, events: ["MESSAGES_UPSERT"] }),
              });
            }
            console.log(`Webhook auto-set on status check [${whResp.status}]`);
          } catch {
            // ignore
          }
        }

        if (connectionId) {
          const connected = stateVal === "open";
          await serviceRole
            .from("wuzapi_connections")
            .update({ is_connected: connected })
            .eq("id", connectionId);
        }

        return new Response(JSON.stringify(statusData), {
          status: statusResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "logout":
        endpoint = `/instance/logout/${currentInstName}`;
        method = "DELETE";
        break;
      case "delete-instance":
        endpoint = `/instance/delete/${currentInstName}`;
        method = "DELETE";
        break;
      case "restart":
        endpoint = `/instance/restart/${currentInstName}`;
        method = "PUT";
        break;
      case "send-message":
        endpoint = `/message/sendText/${currentInstName}`;
        method = "POST";
        fetchBody = JSON.stringify(body);
        break;
      case "send-media": {
        // Evolution API v2 format for sendMedia
        // body: { number, mediatype, mimetype, caption, media (public URL), fileName }
        endpoint = `/message/sendMedia/${currentInstName}`;
        method = "POST";
        const mediaPayload = {
          number: body.number,
          mediatype: body.mediatype || "image",
          mimetype: body.mimetype,
          caption: body.caption || "",
          media: body.media,
          fileName: body.fileName || "arquivo",
        };
        fetchBody = JSON.stringify(mediaPayload);
        console.log(`send-media payload:`, JSON.stringify(mediaPayload));
        break;
      }
      case "send-audio": {
        // Evolution API v2: sendWhatsAppAudio expects { number, audio, encoding }
        endpoint = `/message/sendWhatsAppAudio/${currentInstName}`;
        method = "POST";
        const audioPayload = {
          number: body.number,
          audio: body.audio,
          encoding: true,
        };
        fetchBody = JSON.stringify(audioPayload);
        console.log(`send-audio payload:`, JSON.stringify(audioPayload));
        break;
      }
      case "fetch-instances":
        endpoint = `/instance/fetchInstances?instanceName=${encodeURIComponent(currentInstName)}`;
        method = "GET";
        break;
      case "fetch-profile":
        endpoint = `/instance/fetchInstances?instanceName=${encodeURIComponent(currentInstName)}`;
        method = "GET";
        break;
      case "fetch-contact-picture": {
        const number = body?.number;
        if (!number) {
          return new Response(JSON.stringify({ error: "number required" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        endpoint = `/chat/fetchProfilePictureUrl/${currentInstName}`;
        method = "POST";
        fetchBody = JSON.stringify({ number });
        break;
      }
      case "set-webhook": {
        const supabaseUrl2 = Deno.env.get("SUPABASE_URL")!;
        const whUrl = `${supabaseUrl2}/functions/v1/whatsapp-webhook`;
        // Try v2 format
        endpoint = `/webhook/set/${currentInstName}`;
        method = "POST";
        fetchBody = JSON.stringify({
          webhook: {
            enabled: true,
            url: whUrl,
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT"],
          },
        });
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const fetchOpts: RequestInit = { method, headers };
    if (fetchBody && (method === "POST" || method === "PUT")) {
      fetchOpts.body = fetchBody;
    }

    console.log(`Evolution API call: ${method} ${baseUrl}${endpoint}`, fetchBody ? `body: ${fetchBody.substring(0, 300)}` : "");
    const response = await fetch(`${baseUrl}${endpoint}`, fetchOpts);
    let data: any;
    try {
      data = await response.json();
    } catch {
      const text = await response.text().catch(() => "");
      data = { raw: text };
    }
    console.log(`Evolution API response [${response.status}]:`, JSON.stringify(data).substring(0, 800));

    // If instance doesn't exist (404), return graceful response for non-destructive actions
    if (response.status === 404 && (action === "fetch-instances" || action === "fetch-profile")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Treat logout on missing instance as success
    if (response.status === 404 && action === "logout") {
      return new Response(JSON.stringify({ success: true, message: "Instance already disconnected" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update connection status in DB (use serviceRole to handle org-member owned connections)
    if (connectionId) {
      if (action === "status" || action === "connect") {
        const state = data?.instance?.state || data?.state;
        const connected = state === "open";
        await serviceRole
          .from("wuzapi_connections")
          .update({ is_connected: connected })
          .eq("id", connectionId);
      } else if (action === "logout" || action === "delete-instance") {
        await serviceRole
          .from("wuzapi_connections")
          .update({ is_connected: false })
          .eq("id", connectionId);
      }
    }

    // For logout/delete, treat errors as success (instance may not exist)
    const isDestructiveAction = action === "logout" || action === "delete-instance";
    if (isDestructiveAction && !response.ok) {
      return new Response(JSON.stringify({ success: true, message: "Instance already removed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always return 200, include error info in body if response was not ok
    if (!response.ok) {
      return new Response(JSON.stringify({
        error: data?.message || data?.error || `API returned status ${response.status}`,
        status: response.status,
        data,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Evolution API proxy error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
