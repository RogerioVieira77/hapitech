import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract text from PDF bytes using pdf-parse compatible approach
// We use a streaming text extractor via getDocument from pdf.js port for Deno
async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<string> {
  // Use unpdf which is a Deno-compatible PDF text extractor
  // It wraps Mozilla's PDF.js and works in edge runtimes
  const { extractText } = await import("https://esm.sh/unpdf@0.11.0");

  const { text } = await extractText(pdfBytes, { mergePages: true });
  return text || "";
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

    const { knowledgeFileId } = await req.json();
    if (!knowledgeFileId) {
      return new Response(JSON.stringify({ error: "knowledgeFileId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the knowledge_file record
    const { data: kf, error: kfError } = await supabase
      .from("knowledge_files")
      .select("id, file_name, storage_path, file_type, user_id")
      .eq("id", knowledgeFileId)
      .eq("user_id", user.id)
      .single();

    if (kfError || !kf) {
      return new Response(JSON.stringify({ error: "Arquivo não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kf.file_type !== "pdf") {
      return new Response(JSON.stringify({ error: "Arquivo não é um PDF" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await supabase
      .from("knowledge_files")
      .update({ status: "processing" })
      .eq("id", knowledgeFileId);

    // Download PDF from storage
    console.log(`[extract-pdf] Downloading: ${kf.storage_path}`);
    const { data: blob, error: downloadError } = await supabase.storage
      .from("knowledge")
      .download(kf.storage_path);

    if (downloadError || !blob) {
      await supabase
        .from("knowledge_files")
        .update({ status: "error" })
        .eq("id", knowledgeFileId);
      return new Response(JSON.stringify({ error: "Erro ao baixar PDF: " + downloadError?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert Blob to Uint8Array
    const arrayBuffer = await blob.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    console.log(`[extract-pdf] Extracting text from ${pdfBytes.length} bytes PDF`);

    let extractedText = "";
    try {
      extractedText = await extractTextFromPdf(pdfBytes);
    } catch (extractErr) {
      console.error("[extract-pdf] Extraction error:", extractErr);
      await supabase
        .from("knowledge_files")
        .update({ status: "error" })
        .eq("id", knowledgeFileId);
      return new Response(JSON.stringify({ error: "Erro ao extrair texto do PDF: " + String(extractErr) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean and normalize the extracted text
    extractedText = extractedText
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .replace(/[ \t]{3,}/g, "  ")
      .trim();

    if (!extractedText || extractedText.length < 20) {
      await supabase
        .from("knowledge_files")
        .update({ status: "error" })
        .eq("id", knowledgeFileId);
      return new Response(JSON.stringify({ error: "Não foi possível extrair texto deste PDF. Verifique se o PDF contém texto (não apenas imagens)." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit to 100k chars to avoid token overflow
    const truncated = extractedText.length > 100000
      ? extractedText.slice(0, 100000) + "\n\n[conteúdo truncado por limite]"
      : extractedText;

    console.log(`[extract-pdf] Extracted ${extractedText.length} chars, saving...`);

    // Save extracted text as content in the DB record
    const { error: updateError } = await supabase
      .from("knowledge_files")
      .update({
        content: truncated,
        status: "ready",
        source_type: "document",
      })
      .eq("id", knowledgeFileId);

    if (updateError) {
      console.error("[extract-pdf] Update error:", updateError);
      return new Response(JSON.stringify({ error: "Erro ao salvar texto extraído: " + updateError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[extract-pdf] Done. ${extractedText.length} chars extracted from ${kf.file_name}`);

    return new Response(JSON.stringify({
      ok: true,
      charCount: extractedText.length,
      preview: truncated.slice(0, 300),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[extract-pdf] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
