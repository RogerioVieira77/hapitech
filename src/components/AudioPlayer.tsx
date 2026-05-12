import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Generate fake waveform bars (deterministic from url hash)
function generateBars(count: number, seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Array.from({ length: count }, (_, i) => {
    h = (h * 16807 + i) | 0;
    return 0.2 + 0.8 * (Math.abs(h % 100) / 100);
  });
}

interface AudioPlayerProps {
  src: string;
  sender: "user" | "agent" | string;
}

export default function AudioPlayer({ src, sender }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const speeds = [1, 1.5, 2];
  const bars = useRef(generateBars(32, src)).current;

  

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => setDuration(a.duration);
    const onTime = () => setCurrentTime(a.currentTime);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      // Unlock audio element within user gesture context (required for iOS/Safari)
      a.play().catch(() => {});
      a.src = src;
      try {
        await a.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  }, [playing, src]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrentTime(a.currentTime);
  }, [duration]);

  const cycleSpeed = useCallback(() => {
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [speed]);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl min-w-[220px] max-w-[280px] bg-muted/40">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={toggle}
        className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors bg-foreground/10 hover:bg-foreground/20 text-foreground"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      {/* Waveform + time */}
      <div className="flex-1 flex flex-col gap-1">
        {/* Waveform bars */}
        <div
          className="flex items-end gap-[2px] h-6 cursor-pointer"
          onClick={seek}
        >
          {bars.map((h, i) => {
            const barProgress = i / bars.length;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${h * 100}%`,
                  backgroundColor: isActive
                    ? "hsl(var(--foreground) / 0.75)"
                    : "hsl(var(--foreground) / 0.18)",
                  minWidth: 2,
                }}
              />
            );
          })}
        </div>

        {/* Time */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatTime(playing ? currentTime : 0)}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Speed control */}
      <button
        onClick={cycleSpeed}
        className="flex-shrink-0 h-7 min-w-[36px] px-1.5 rounded-full text-[10px] font-bold tabular-nums transition-colors bg-foreground/10 hover:bg-foreground/20 text-muted-foreground"
      >
        {speed}x
      </button>
    </div>
  );
}
