import { useState, useEffect } from "react";
import { Image, Film, Mic, FileText } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import AudioPlayer from "@/components/AudioPlayer";

interface ChatMediaContentProps {
  mediaUrl: string | null;
  mediaType: string | null;
  sender: string;
  isSticker?: boolean;
  onImageClick?: (url: string) => void;
  t: (key: string) => string;
}

export function ChatMediaContent({ mediaUrl, mediaType, sender, isSticker, onImageClick, t }: ChatMediaContentProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mediaUrl) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    resolveMediaUrl(mediaUrl).then((url) => {
      if (!cancelled) { setResolvedUrl(url); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [mediaUrl]);

  if (!mediaType) return null;

  if (loading || !resolvedUrl) {
    return (
      <div className="mb-1.5">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/20 border border-border/10 animate-pulse">
          {mediaType === "image" ? <Image className="h-4 w-4 text-muted-foreground/60" /> :
           mediaType === "video" ? <Film className="h-4 w-4 text-muted-foreground/60" /> :
           mediaType === "audio" ? <Mic className="h-4 w-4 text-muted-foreground/60" /> :
           <FileText className="h-4 w-4 text-muted-foreground/60" />}
          <span className="text-[12px] text-muted-foreground/60">
            {mediaType === "image" ? t("chat.image") : mediaType === "video" ? t("chat.video") : mediaType === "audio" ? t("chat.audio") : t("chat.document")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-1.5">
      {mediaType === "image" || mediaType === "sticker" ? (
        <img
          src={resolvedUrl}
          alt=""
          className={`rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity ${isSticker || mediaType === "sticker" ? "max-w-[150px]" : "max-w-full max-h-64"}`}
          loading="lazy"
          onClick={() => onImageClick?.(resolvedUrl)}
        />
      ) : mediaType === "video" ? (
        <video src={resolvedUrl} controls className="max-w-full rounded-xl max-h-64" />
      ) : mediaType === "audio" ? (
        <AudioPlayer src={resolvedUrl} sender={sender} />
      ) : mediaType === "document" ? (
        <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
          <FileText className="h-4 w-4" />
          <span className="text-[12px]">{t("chat.openDocument")}</span>
        </a>
      ) : null}
    </div>
  );
}
