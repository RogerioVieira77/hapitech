import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  // Strategy 1: Use YouTube's timedtext API via the video page
  console.log(`[youtube-transcript] Fetching video page for ${videoId}`);
  
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });
  
  if (!pageResp.ok) throw new Error(`Não foi possível acessar o vídeo (HTTP ${pageResp.status})`);
  
  const html = await pageResp.text();
  
  // Extract video title
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const videoTitle = titleMatch ? titleMatch[1].replace(" - YouTube", "").trim() : `Video ${videoId}`;
  
  // Try to find captions/subtitles track URL from the page source
  const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s);
  
  let transcript = "";
  
  if (captionMatch) {
    try {
      // Find caption track URLs in the JSON
      const captionUrls = [...html.matchAll(/"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]*)"/g)];
      
      if (captionUrls.length > 0) {
        // Prefer Portuguese, then English, then first available
        let selectedUrl = captionUrls[0][1];
        for (const [, url] of captionUrls) {
          if (url.includes("lang=pt") || url.includes("lang=pt-BR")) {
            selectedUrl = url;
            break;
          }
          if (url.includes("lang=en")) {
            selectedUrl = url;
          }
        }
        
        // Unescape the URL
        selectedUrl = selectedUrl.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
        
        console.log(`[youtube-transcript] Fetching captions from timedtext API`);
        const captionResp = await fetch(selectedUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10000),
        });
        
        if (captionResp.ok) {
          const captionXml = await captionResp.text();
          // Extract text from XML <text> tags
          const texts = [...captionXml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
            .map(m => m[1]
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\n/g, " ")
              .trim()
            )
            .filter(t => t.length > 0);
          
          transcript = texts.join(" ");
          console.log(`[youtube-transcript] Extracted ${transcript.length} chars from captions`);
        }
      }
    } catch (e) {
      console.log(`[youtube-transcript] Caption parsing failed: ${e}`);
    }
  }
  
  // Strategy 2: Try Jina Reader as fallback
  if (!transcript || transcript.length < 50) {
    console.log(`[youtube-transcript] Trying Jina Reader fallback...`);
    try {
      const jinaResp = await fetch(`https://r.jina.ai/https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          "Accept": "text/plain",
          "X-No-Cache": "true",
        },
        signal: AbortSignal.timeout(25000),
      });
      
      if (jinaResp.ok) {
        const jinaText = await jinaResp.text();
        // Jina often extracts transcript from YouTube pages
        if (jinaText.length > (transcript?.length || 0)) {
          transcript = jinaText
            .replace(/\!\[.*?\]\(.*?\)/g, "")
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          console.log(`[youtube-transcript] Jina extracted ${transcript.length} chars`);
        }
      }
    } catch (e) {
      console.log(`[youtube-transcript] Jina fallback failed: ${e}`);
    }
  }

  // Strategy 3: Extract description and metadata from page
  if (!transcript || transcript.length < 50) {
    console.log(`[youtube-transcript] Extracting description fallback...`);
    const descMatch = html.match(/"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const description = descMatch ? descMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim() : "";
    
    if (description.length > 20) {
      transcript = `Título: ${videoTitle}\n\nDescrição:\n${description}`;
      console.log(`[youtube-transcript] Using description: ${transcript.length} chars`);
    }
  }
  
  if (transcript && !transcript.startsWith("Título:")) {
    transcript = `Título: ${videoTitle}\n\nTranscrição:\n${transcript}`;
  }
  
  return transcript;
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

    const videoId = extractVideoId(url);
    if (!videoId) {
      return new Response(JSON.stringify({ error: "URL de vídeo inválida. Use um link do YouTube." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[youtube-transcript] Processing video: ${videoId}`);
    
    const transcript = await fetchYouTubeTranscript(videoId);
    
    if (!transcript || transcript.length < 30) {
      return new Response(JSON.stringify({ 
        error: "Não foi possível extrair conteúdo deste vídeo. O vídeo pode não ter legendas disponíveis." 
      }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit to 50k chars
    const content = transcript.length > 50000 
      ? transcript.slice(0, 50000) + "\n\n[conteúdo truncado]" 
      : transcript;

    // Save as knowledge_file
    const fileName = `youtube-${videoId}.txt`;
    const contentBytes = new TextEncoder().encode(content);
    const storagePath = `videos/${user.id}/${Date.now()}_${videoId}.txt`;

    const { error: uploadError } = await supabase.storage
      .from("knowledge")
      .upload(storagePath, contentBytes, { contentType: "text/plain", upsert: false });

    if (uploadError) {
      console.error("[youtube-transcript] Storage error:", uploadError);
      return new Response(JSON.stringify({ error: "Erro ao salvar: " + uploadError.message }), {
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
        source_type: "video",
        source_url: `https://youtube.com/watch?v=${videoId}`,
        content: content.slice(0, 10000),
      })
      .select("id")
      .single();

    if (kfError) {
      console.error("[youtube-transcript] Insert error:", kfError);
      return new Response(JSON.stringify({ error: "Erro ao salvar: " + kfError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: linkError } = await supabase
      .from("agent_knowledge_files")
      .insert({ agent_id: agentId, knowledge_file_id: kfData.id });

    if (linkError) {
      console.error("[youtube-transcript] Link error:", linkError);
    }

    // Trigger embedding generation
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({ knowledge_file_id: kfData.id }),
      });
    } catch (_) { /* embeddings are optional */ }

    console.log(`[youtube-transcript] Done. knowledge_file=${kfData.id}`);

    return new Response(JSON.stringify({
      ok: true,
      knowledgeFileId: kfData.id,
      charCount: content.length,
      fileName,
      videoId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[youtube-transcript] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
