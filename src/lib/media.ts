import { supabase } from "@/integrations/supabase/client";

const BUCKET = "chat-media";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const SIGNED_EXPIRY = 3600; // 1 hour

// In-memory cache: path → { url, expiresAt }
const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Extract storage path from a full public URL or return as-is if already a path.
 */
export function extractStoragePath(mediaUrl: string): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith(PUBLIC_PREFIX)) {
    const raw = mediaUrl.slice(PUBLIC_PREFIX.length);
    return raw.split("?")[0]; // remove cache-buster
  }
  if (!mediaUrl.startsWith("http")) {
    return mediaUrl; // already a path
  }
  // External URL (e.g. WhatsApp CDN) — not in our storage
  return null;
}

/**
 * Resolve a media_url (path or legacy public URL) to an accessible signed URL.
 * Returns the original URL if it's external.
 */
export async function resolveMediaUrl(mediaUrl: string | null): Promise<string | null> {
  if (!mediaUrl) return null;

  const path = extractStoragePath(mediaUrl);
  if (!path) return mediaUrl; // external URL, return as-is

  // Check cache
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Generate signed URL
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_EXPIRY);

  if (error || !data?.signedUrl) {
    console.error("Failed to create signed URL:", error);
    return mediaUrl; // fallback
  }

  cache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + (SIGNED_EXPIRY - 60) * 1000, // refresh 1 min early
  });

  return data.signedUrl;
}

/**
 * Upload to chat-media and return the storage path (NOT a public URL).
 */
export async function uploadChatMedia(
  path: string,
  file: Blob,
  contentType: string,
  upsert = false
): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert });
  if (error) throw error;
  return path;
}

/**
 * Create a short-lived signed URL for sending to external APIs (Telegram, WhatsApp).
 */
export async function createSendableUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Failed to create sendable URL");
  return data.signedUrl;
}
