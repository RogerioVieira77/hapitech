import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, QrCode, ShieldCheck, CheckCircle2, ShieldOff, Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type MfaStep = "idle" | "enroll" | "verify" | "enabled";

export function SecurityTab() {
  const { toast } = useToast();
  const [step, setStep] = useState<MfaStep>("idle");
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

  // Enroll data
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");

  // Existing factor
  const [existingFactorId, setExistingFactorId] = useState<string | null>(null);

  useEffect(() => {
    checkExistingFactors();
  }, []);

  const checkExistingFactors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const totpFactors = data.totp || [];
      const verifiedFactor = totpFactors.find((f: any) => f.status === "verified");
      if (verifiedFactor) {
        setExistingFactorId(verifiedFactor.id);
        setStep("enabled");
      } else {
        // Clean up any unverified factors
        for (const f of totpFactors.filter((f: any) => f.status === "unverified")) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        setStep("idle");
      }
    } catch {
      setStep("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator App",
      });
      if (error) throw error;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep("enroll");
    } catch (err: any) {
      toast({ title: "Erro ao iniciar configuração", description: err.message, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError("Digite um código de 6 dígitos.");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      setExistingFactorId(factorId);
      setStep("enabled");
      toast({ title: "2FA ativado com sucesso!" });
    } catch (err: any) {
      setError(err.message || "Código inválido. Tente novamente.");
    } finally {
      setVerifying(false);
    }
  };

  const handleUnenroll = async () => {
    if (!existingFactorId) return;
    setUnenrolling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: existingFactorId });
      if (error) throw error;
      setExistingFactorId(null);
      setStep("idle");
      setVerifyCode("");
      setQrCode("");
      setSecret("");
      setFactorId("");
      toast({ title: "2FA desativado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao desativar 2FA", description: err.message, variant: "destructive" });
    } finally {
      setUnenrolling(false);
    }
  };

  const handleCancel = async () => {
    if (factorId) {
      try {
        await supabase.auth.mfa.unenroll({ factorId });
      } catch {}
    }
    setStep("idle");
    setVerifyCode("");
    setQrCode("");
    setSecret("");
    setFactorId("");
    setError("");
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    toast({ title: "Código copiado!" });
  };

  if (loading) {
    return (
      <div className="bg-card rounded-3xl border border-border/15 shadow-none p-6 md:p-8 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-3xl border border-border/15 shadow-none p-6 md:p-8 space-y-6">
      <div>
        <h3 className="text-[15px] font-semibold text-foreground">Autenticação de dois fatores</h3>
        <p className="text-[12px] text-muted-foreground/50 mt-1">Configurar Autenticação de 2 Fatores</p>
        <p className="text-[11px] text-muted-foreground/35 mt-1">
          Adicione uma camada extra de segurança à sua conta com a autenticação de 2 fatores.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {/* ─── IDLE: Show steps + "Configurar Agora" ─── */}
        {step === "idle" && (
          <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5 max-w-lg">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-2xl bg-muted/30 shrink-0 mt-0.5">
                <QrCode className="h-5 w-5 text-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Etapa 1: Escaneie o QR Code</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Use seu aplicativo de autenticação para escanear o código QR.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-2xl bg-muted/30 shrink-0 mt-0.5">
                <ShieldCheck className="h-5 w-5 text-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Etapa 2: Insira o código de verificação</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Digite o código de 6 dígitos exibido no seu aplicativo de autenticação.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-2xl bg-muted/30 shrink-0 mt-0.5">
                <CheckCircle2 className="h-5 w-5 text-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Etapa 3: Pronto!</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Sua conta agora está protegida com autenticação de dois fatores.</p>
              </div>
            </div>
            <Button
              onClick={handleEnroll}
              disabled={enrolling}
              className="h-11 px-8 rounded-2xl text-sm font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-none"
            >
              {enrolling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Configurar Agora
            </Button>
          </motion.div>
        )}

        {/* ─── ENROLL: Show QR Code + Secret ─── */}
        {step === "enroll" && (
          <motion.div key="enroll" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-6 max-w-lg">
            <div>
              <div className="flex items-start gap-4 mb-4">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted/50 shrink-0 mt-0.5">
                  <QrCode className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Etapa 1: Escaneie o QR Code</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use um aplicativo autenticador como <span className="text-primary">1Password</span>, <span className="text-primary">Google Authenticator</span> ou <span className="text-primary">Microsoft Authenticator</span> para gerar senhas de uso único que são usadas como um <strong>segundo fator</strong> quando você faz login no aplicativo.
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center mb-4">
                Digitalize o <strong>código QR</strong> usando seu aplicativo autenticador
              </p>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-xl">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
              </div>

              {/* Secret fallback */}
              <div className="mt-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground">Ou insira o código abaixo no aplicativo autenticador</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-sm font-mono font-bold text-foreground tracking-wider bg-muted/50 px-3 py-1.5 rounded-lg">
                    {secret}
                  </code>
                  <button onClick={copySecret} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Verify code input */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Código de verificação (6 dígitos)</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="bg-background border-border/40 h-10 text-sm text-center tracking-[0.5em] font-mono text-lg"
                onKeyDown={e => e.key === "Enter" && handleVerify()}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleVerify}
                disabled={verifying || verifyCode.length !== 6}
                className="h-11 flex-1 rounded-2xl text-sm font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-none"
              >
                {verifying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Continuar
              </Button>
            </div>
            <button
              onClick={handleCancel}
              className="text-sm text-primary hover:underline w-full text-center"
            >
              Cancelar
            </button>
          </motion.div>
        )}

        {/* ─── ENABLED: 2FA is active ─── */}
        {step === "enabled" && (
          <motion.div key="enabled" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5 max-w-lg">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">2FA está ativado</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Sua conta está protegida com autenticação de dois fatores.</p>
              </div>
            </div>

            <Button
              variant="destructive"
              onClick={handleUnenroll}
              disabled={unenrolling}
              className="h-11 px-8 rounded-2xl text-sm font-semibold shadow-none"
            >
              {unenrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldOff className="h-4 w-4 mr-2" />}
              Desativar 2FA
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
