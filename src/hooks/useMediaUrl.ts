import { useState, useEffect } from "react";
import { resolveMediaUrl } from "@/lib/media";

/**
 * Hook that resolves a media_url (storage path or legacy public URL)
 * to an accessible signed URL. Returns null while loading.
 */
export function useMediaUrl(mediaUrl: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaUrl) {
      setResolved(null);
      return;
    }

    let cancelled = false;
    resolveMediaUrl(mediaUrl).then((url) => {
      if (!cancelled) setResolved(url);
    });

    return () => { cancelled = true; };
  }, [mediaUrl]);

  return resolved;
}
