import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 800;        // chars per chunk
const CHUNK_OVERLAP = 150;     // chars overlap between chunks
const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims

// ── Split text into overlapping chunks ──────────────────────────────────────
function chunkText(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + CHUNK_SIZE, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 30) chunks.push(chunk); // skip trivially short chunks
    if (end >= cleaned.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

// ── Generate embedding for a single text via Lovable AI gateway ─────────────
async function embedText(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding as number[];
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { knowledge_file_id } = await req.json();

    if (!knowledge_file_id) {
      return new Response(
        JSON.stringify({ error: "knowledge_file_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Fetch the knowledge file ─────────────────────────────────────────────
    const { data: file, error: fileErr } = await supabase
      .from("knowledge_files")
      .select("id, file_name, content, storage_path, source_url")
      .eq("id", knowledge_file_id)
      .single();

    if (fileErr || !file) {
      return new Response(
        JSON.stringify({ error: "Knowledge file not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Get text content ─────────────────────────────────────────────────────
    let text = file.content || "";
    if (!text) {
      try {
        const { data: blob } = await supabase.storage
          .from("knowledge")
          .download(file.storage_path);
        if (blob) text = await blob.text();
      } catch (e) {
        console.error("[embeddings] Failed to download from storage:", e);
      }
    }

    if (!text || text.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "No content to embed", chunks: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Delete existing chunks for this file ─────────────────────────────────
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("knowledge_file_id", knowledge_file_id);

    // ── Chunk the content ────────────────────────────────────────────────────
    const chunks = chunkText(text);
    console.log(`[embeddings] ${file.file_name}: ${chunks.length} chunks from ${text.length} chars`);

    // ── Generate embeddings and insert ───────────────────────────────────────
    let successCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await embedText(chunks[i], LOVABLE_API_KEY);

        await supabase.from("knowledge_chunks").insert({
          knowledge_file_id,
          chunk_index: i,
          content: chunks[i],
          embedding: JSON.stringify(embedding),
        });

        successCount++;
        // Small delay to avoid rate limiting
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 60));
      } catch (err) {
        console.error(`[embeddings] Chunk ${i} failed:`, err);
      }
    }

    // ── Mark file as indexed ─────────────────────────────────────────────────
    await supabase
      .from("knowledge_files")
      .update({ status: "indexed" })
      .eq("id", knowledge_file_id);

    console.log(`[embeddings] Done: ${successCount}/${chunks.length} chunks embedded`);

    return new Response(
      JSON.stringify({ success: true, chunks: successCount, total: chunks.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[embeddings] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
