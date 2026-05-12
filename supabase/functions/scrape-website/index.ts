import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<\/?(p|div|h[1-6]|li|section|article|br|tr|td|th)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, agentId } = await req.json();
    if (!url || !agentId) {
      return new Response(JSON.stringify({ error: "url and agentId are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[scrape-website] Fetching: ${url}`);
    let scrapedContent = "";

    // Strategy 1: Try Jina Reader (handles JS-rendered sites)
    try {
      console.log(`[scrape-website] Trying Jina Reader...`);
      const jinaResp = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          "Accept": "text/plain",
          "X-No-Cache": "true",
        },
        signal: AbortSignal.timeout(25000),
      });

      if (jinaResp.ok) {
        const text = await jinaResp.text();
        // Jina returns markdown-like text, clean it up
        scrapedContent = text
          .replace(/\!\[.*?\]\(.*?\)/g, "") // remove markdown images
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1") // convert links to text
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        console.log(`[scrape-website] Jina extracted ${scrapedContent.length} chars`);
      }
    } catch (jinaErr) {
      console.log(`[scrape-website] Jina failed: ${jinaErr}`);
    }

    // Strategy 2: Fallback to direct fetch if Jina returned little content
    if (!scrapedContent || scrapedContent.length < 30) {
      try {
        console.log(`[scrape-website] Trying direct fetch...`);
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });

        if (resp.ok) {
          const html = await resp.text();
          const directContent = extractTextFromHtml(html);
          if (directContent.length > scrapedContent.length) {
            scrapedContent = directContent;
          }
          console.log(`[scrape-website] Direct fetch extracted ${directContent.length} chars`);
        }
      } catch (fetchErr) {
        console.error("[scrape-website] Direct fetch error:", fetchErr);
      }
    }

    // Limit to 50k chars
    if (scrapedContent.length > 50000) {
      scrapedContent = scrapedContent.slice(0, 50000) + "\n\n[conteúdo truncado]";
    }

    console.log(`[scrape-website] Final content: ${scrapedContent.length} chars`);

    if (!scrapedContent || scrapedContent.length < 20) {
      return new Response(JSON.stringify({ 
        error: "Não foi possível extrair conteúdo deste site. O site pode usar tecnologias que impedem a extração automática. Tente adicionar o conteúdo manualmente via texto." 
      }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save as knowledge_file
    const domain = new URL(url).hostname;
    const fileName = `${domain}.txt`;
    const contentBytes = new TextEncoder().encode(scrapedContent);

    const storagePath = `websites/${user.id}/${Date.now()}_${domain}.txt`;
    const { error: uploadError } = await supabase.storage
      .from("knowledge")
      .upload(storagePath, contentBytes, { contentType: "text/plain", upsert: false });

    if (uploadError) {
      console.error("[scrape-website] Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Erro ao salvar no storage: " + uploadError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: kfData, error: kfError } = await supabase
      .from("knowledge_files")
      .insert({
        user_id: user.id,
        file_name: fileName,
        file_size: contentBytes.length,
        file_type: "txt",
        storage_path: storagePath,
        status: "uploaded",
        source_type: "website",
        source_url: url,
        content: scrapedContent.slice(0, 10000),
      })
      .select("id")
      .single();

    if (kfError) {
      console.error("[scrape-website] Insert knowledge_file error:", kfError);
      return new Response(JSON.stringify({ error: "Erro ao salvar conhecimento: " + kfError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: linkError } = await supabase
      .from("agent_knowledge_files")
      .insert({ agent_id: agentId, knowledge_file_id: kfData.id });

    if (linkError) {
      console.error("[scrape-website] Link error:", linkError);
    }

    console.log(`[scrape-website] Done. knowledge_file=${kfData.id}, linked to agent=${agentId}`);

    return new Response(JSON.stringify({
      ok: true,
      knowledgeFileId: kfData.id,
      charCount: scrapedContent.length,
      fileName,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[scrape-website] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
