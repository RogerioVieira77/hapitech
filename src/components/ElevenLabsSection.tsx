import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Volume2, Key, Zap, Save, ExternalLink, Eye, EyeOff, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import elevenLabsLogo from "@/assets/elevenlabs-logo.png";

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

const TTS_MODELS = [
  { value: "eleven_multilingual_v2", label: "Multilingual v2 (melhor qualidade)" },
  { value: "eleven_turbo_v2_5", label: "Turbo v2.5 (baixa latência)" },
  { value: "eleven_turbo_v2", label: "Turbo v2 (velocidade)" },
  { value: "eleven_monolingual_v1", label: "Monolingual v1 (inglês)" },
];

interface ElevenLabsConfig {
  elevenlabs_api_key: string | null;
  elevenlabs_voice_id: string;
  elevenlabs_model: string;
  elevenlabs_enabled: boolean;
  elevenlabs_always_audio: boolean;
  elevenlabs_audio_on_audio: boolean;
  elevenlabs_stability: number;
  elevenlabs_similarity: number;
  elevenlabs_style: number;
  elevenlabs_speed: number;
  elevenlabs_speaker_boost: boolean;
}

interface Props {
  agentId: string;
  config: ElevenLabsConfig;
  onConfigChange: (config: Partial<ElevenLabsConfig>) => void;
}

export function ElevenLabsSection({ agentId, config, onConfigChange }: Props) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [testText, setTestText] = useState("Olá! Eu sou o assistente virtual e estou pronto para ajudar.");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasApiKey = !!config.elevenlabs_api_key && config.elevenlabs_api_key.length > 5;

  const fetchVoices = useCallback(async () => {
    if (!config.elevenlabs_api_key) {
      toast.error("Informe a API Key primeiro");
      return;
    }
    setLoadingVoices(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "list_voices", agent_id: agentId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar vozes");
      setVoices(data.voices || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingVoices(false);
    }
  }, [config.elevenlabs_api_key]);

  useEffect(() => {
    if (config.elevenlabs_api_key && config.elevenlabs_api_key.length > 10) {
      fetchVoices();
    }
  }, [config.elevenlabs_api_key]);

  const handleTestVoice = async () => {
    if (!config.elevenlabs_api_key || !testText.trim()) return;
    setTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: "tts",
            agent_id: agentId,
            text: testText,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro no TTS");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("agents")
        .update({
          elevenlabs_api_key: config.elevenlabs_api_key,
          elevenlabs_voice_id: config.elevenlabs_voice_id,
          elevenlabs_model: config.elevenlabs_model,
          elevenlabs_enabled: config.elevenlabs_enabled,
          elevenlabs_always_audio: config.elevenlabs_always_audio,
          elevenlabs_audio_on_audio: config.elevenlabs_audio_on_audio,
          elevenlabs_stability: config.elevenlabs_stability,
          elevenlabs_similarity: config.elevenlabs_similarity,
          elevenlabs_style: config.elevenlabs_style,
          elevenlabs_speed: config.elevenlabs_speed,
          elevenlabs_speaker_boost: config.elevenlabs_speaker_boost,
        } as any)
        .eq("id", agentId);
      if (error) throw error;
      toast.success("Configurações ElevenLabs salvas!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!tempKey.trim()) {
      toast.error("Informe a API Key");
      return;
    }
    setSavingKey(true);
    try {
      const { error } = await supabase
        .from("agents")
        .update({ elevenlabs_api_key: tempKey.trim() } as any)
        .eq("id", agentId);
      if (error) throw error;
      onConfigChange({ elevenlabs_api_key: tempKey.trim() });
      setShowKeyInput(false);
      setTempKey("");
      toast.success("API Key salva com sucesso!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("agents")
        .update({ elevenlabs_api_key: null, elevenlabs_enabled: false } as any)
        .eq("id", agentId);
      if (error) throw error;
      onConfigChange({ elevenlabs_api_key: null, elevenlabs_enabled: false });
      setVoices([]);
      toast.success("Integração ElevenLabs removida!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedVoiceName = voices.find(v => v.voice_id === config.elevenlabs_voice_id)?.name || config.elevenlabs_voice_id;

  // State: No API Key → show integration card
  if (!hasApiKey) {
    return (
      <div className="space-y-6 max-w-2xl">
        {/* Integration Card */}
        <div className="flex flex-col items-center text-center p-8 rounded-xl border border-border/20 bg-card/40 space-y-4">
          <img src={elevenLabsLogo} alt="ElevenLabs" className="h-14 w-14 rounded-xl border border-border/20 p-2" />
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-foreground">ElevenLabs</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              Com ElevenLabs você dá a capacidade do seu agente responder seus clientes em áudio, tornando ainda mais humanizado.
            </p>
          </div>

          {!showKeyInput ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeyInput(true)}
              className="mt-2 font-semibold tracking-wide"
            >
              CONFIGURAR INTEGRAÇÃO
            </Button>
          ) : (
            <div className="w-full max-w-sm space-y-3 mt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-left block">API Key</Label>
                <Input
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  type="password"
                  placeholder="sk_..."
                  className="h-9 text-sm bg-background/50 border-border/40"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground text-left">
                  Obtenha em{" "}
                  <a href="https://elevenlabs.io/settings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                    elevenlabs.io/settings <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </p>
              </div>
              <div className="flex gap-2 justify-center">
                <Button
                  size="sm"
                  onClick={handleSaveApiKey}
                  disabled={savingKey || !tempKey.trim()}
                  className="gap-1.5"
                >
                  {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar Key
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowKeyInput(false); setTempKey(""); }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // State: Has API Key → show full config
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={elevenLabsLogo} alt="ElevenLabs" className="h-8 w-8 rounded-lg" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">ElevenLabs</h3>
            <p className="text-[11px] text-muted-foreground">Dê voz ao seu agente! Respostas em áudio no WhatsApp, Widget e Telegram.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config.elevenlabs_enabled && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
              Ativo
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRemoveApiKey}
            className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Remover integração"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border/20 bg-card/40">
        <div>
          <p className="text-sm font-medium">Ativar ElevenLabs</p>
          <p className="text-[11px] text-muted-foreground">Habilita respostas em áudio para este agente</p>
        </div>
        <Switch
          checked={config.elevenlabs_enabled}
          onCheckedChange={(v) => onConfigChange({ elevenlabs_enabled: v })}
        />
      </div>

      {config.elevenlabs_enabled && (
        <>
          {/* API Key (masked) */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-semibold">API Key</Label>
            </div>
            <div className="relative">
              <Input
                value={config.elevenlabs_api_key || ""}
                onChange={(e) => onConfigChange({ elevenlabs_api_key: e.target.value })}
                type={showKey ? "text" : "password"}
                placeholder="sk_..."
                className="pr-10 h-9 text-sm bg-background/50 border-border/40"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground/70"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Obtenha em{" "}
              <a href="https://elevenlabs.io/settings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                elevenlabs.io/settings <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </p>
          </div>

          {/* Voice Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Voz</Label>
              <button
                onClick={fetchVoices}
                disabled={loadingVoices || !config.elevenlabs_api_key}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                <Zap className="h-3 w-3" />
                Buscar vozes da conta
              </button>
            </div>
            <Select
              value={config.elevenlabs_voice_id}
              onValueChange={(v) => onConfigChange({ elevenlabs_voice_id: v })}
            >
              <SelectTrigger className="h-9 text-sm bg-background/50 border-border/40">
                <SelectValue>
                  {loadingVoices ? "Carregando..." : (voices.length > 0 ? selectedVoiceName : config.elevenlabs_voice_id)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.voice_id} value={v.voice_id} className="text-sm">
                    {v.name} {v.labels?.gender ? `(${v.labels.gender === "male" ? "Masculina" : "Feminina"})` : ""}
                  </SelectItem>
                ))}
                {voices.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Clique em "Buscar vozes" para carregar
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Modelo</Label>
            <Select
              value={config.elevenlabs_model}
              onValueChange={(v) => onConfigChange({ elevenlabs_model: v })}
            >
              <SelectTrigger className="h-9 text-sm bg-background/50 border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TTS_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-sm">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Audio Response Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/15 bg-card/30">
              <div>
                <p className="text-[13px] font-medium">Responder sempre em áudio</p>
                <p className="text-[10px] text-muted-foreground">O agente enviará todas as respostas como áudio.</p>
              </div>
              <Switch
                checked={config.elevenlabs_always_audio}
                onCheckedChange={(v) => onConfigChange({ elevenlabs_always_audio: v })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/15 bg-card/30">
              <div>
                <p className="text-[13px] font-medium">Responder em áudio quando receber áudio</p>
                <p className="text-[10px] text-muted-foreground">O agente responde em áudio apenas quando o contato enviar uma mensagem de áudio.</p>
              </div>
              <Switch
                checked={config.elevenlabs_audio_on_audio}
                onCheckedChange={(v) => onConfigChange({ elevenlabs_audio_on_audio: v })}
              />
            </div>
          </div>

          {/* Voice Settings Sliders */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-[11px] font-medium">Estabilidade: {config.elevenlabs_stability.toFixed(2)}</Label>
                </div>
                <Slider
                  value={[config.elevenlabs_stability]}
                  onValueChange={([v]) => onConfigChange({ elevenlabs_stability: v })}
                  min={0} max={1} step={0.01}
                  className="py-1"
                />
                <p className="text-[9px] text-muted-foreground/60">Menor = mais expressivo, Maior = mais consistente</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-[11px] font-medium">Similaridade: {config.elevenlabs_similarity.toFixed(2)}</Label>
                </div>
                <Slider
                  value={[config.elevenlabs_similarity]}
                  onValueChange={([v]) => onConfigChange({ elevenlabs_similarity: v })}
                  min={0} max={1} step={0.01}
                  className="py-1"
                />
                <p className="text-[9px] text-muted-foreground/60">Fidelidade às características da voz original</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-[11px] font-medium">Estilo: {config.elevenlabs_style.toFixed(2)}</Label>
                </div>
                <Slider
                  value={[config.elevenlabs_style]}
                  onValueChange={([v]) => onConfigChange({ elevenlabs_style: v })}
                  min={0} max={1} step={0.01}
                  className="py-1"
                />
                <p className="text-[9px] text-muted-foreground/60">Exagero do estilo da voz (tom, emoção)</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-[11px] font-medium">Velocidade: {config.elevenlabs_speed.toFixed(2)}</Label>
                </div>
                <Slider
                  value={[config.elevenlabs_speed]}
                  onValueChange={([v]) => onConfigChange({ elevenlabs_speed: v })}
                  min={0.7} max={1.2} step={0.01}
                  className="py-1"
                />
                <p className="text-[9px] text-muted-foreground/60">0.7 = mais lento, 1.2 = mais rápido</p>
              </div>
            </div>

            {/* Speaker Boost */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/15 bg-card/30">
              <div>
                <p className="text-[13px] font-medium">Speaker Boost</p>
                <p className="text-[10px] text-muted-foreground">Melhora clareza e semelhança com a voz original</p>
              </div>
              <Switch
                checked={config.elevenlabs_speaker_boost}
                onCheckedChange={(v) => onConfigChange({ elevenlabs_speaker_boost: v })}
              />
            </div>
          </div>

          {/* Test Voice */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Texto para teste de voz</Label>
            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="w-full h-20 px-3 py-2 rounded-lg border border-border/30 bg-background/50 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestVoice}
              disabled={testing || !config.elevenlabs_api_key || !testText.trim()}
              className="gap-1.5"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
              Testar voz
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
