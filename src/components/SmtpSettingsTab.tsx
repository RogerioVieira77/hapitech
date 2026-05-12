import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Mail, Save, Eye, EyeOff, TestTube, Loader2, CheckCircle, LogIn, Unlink, Key } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SmtpSettings {
  id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  sender_name: string;
  sender_email: string;
  is_active: boolean;
  gmail_oauth_refresh_token: string | null;
  gmail_oauth_email: string | null;
  use_gmail_oauth: boolean;
}

export function SmtpSettingsTab() {
  const [settings, setSettings] = useState<SmtpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showClientSecret, setShowClientSecret] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  // Listen for OAuth callback
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "gmail-oauth-callback" && event.data?.code) {
        setConnectingOAuth(true);
        try {
          const { data, error } = await supabase.functions.invoke("gmail-oauth-token", {
            body: { code: event.data.code, redirect_uri: event.data.redirect_uri, client_id: event.data.client_id, client_secret: event.data.client_secret },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          toast.success(`Gmail conectado: ${data.email}`);
          await loadSettings();
        } catch (err: any) {
          toast.error(`Erro ao conectar Gmail: ${err.message}`);
        } finally {
          setConnectingOAuth(false);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("smtp_settings" as any)
      .select("*")
      .limit(1)
      .single();
    if (data) setSettings(data as any);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("smtp_settings" as any)
        .update({
          smtp_host: settings.smtp_host,
          smtp_port: settings.smtp_port,
          smtp_user: settings.smtp_user,
          smtp_pass: settings.smtp_pass,
          sender_name: settings.sender_name,
          sender_email: settings.sender_email,
          is_active: settings.is_active,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", settings.id);
      if (error) throw error;
      toast.success("Configurações SMTP salvas com sucesso!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.error("Digite um e-mail para teste");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-recovery-email", {
        body: { email: testEmail },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const methodLabels: Record<string, string> = {
        gmail_oauth: "Gmail OAuth",
        smtp: "SMTP personalizado",
        supabase: "Supabase (padrão)",
        silent: "Silencioso (usuário não encontrado)",
      };
      toast.success(`E-mail enviado via ${methodLabels[data?.method] || data?.method}!`);
    } catch (err: any) {
      toast.error(`Erro ao enviar: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleConnectGmail = () => {
    if (!clientId.trim()) {
      toast.error("Preencha o Google Client ID");
      return;
    }
    const redirectUri = `${window.location.origin}/gmail-oauth-callback`;
    const scope = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId.trim())}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&access_type=offline` +
      `&prompt=consent`;

    // Store credentials temporarily for the callback page
    sessionStorage.setItem("gmail_oauth_client_id", clientId.trim());
    sessionStorage.setItem("gmail_oauth_client_secret", clientSecret.trim());

    const popup = window.open(authUrl, "gmail-oauth", "width=500,height=600,scrollbars=yes");
    if (!popup) {
      toast.error("Popup bloqueado pelo navegador. Permita popups e tente novamente.");
    }
  };

  const handleDisconnectGmail = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("smtp_settings" as any)
        .update({
          gmail_oauth_refresh_token: null,
          gmail_oauth_email: null,
          use_gmail_oauth: false,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", settings.id);
      if (error) throw error;
      toast.success("Gmail OAuth desconectado");
      await loadSettings();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof SmtpSettings, value: any) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma configuração encontrada.</p>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">

      {/* Gmail OAuth Section */}
      <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Gmail OAuth</h3>
              <p className="text-[11px] text-muted-foreground/50">Conecte sua conta Google para enviar e-mails via Gmail API</p>
            </div>
          </div>
          {settings.use_gmail_oauth && settings.gmail_oauth_email && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
              <CheckCircle className="h-2.5 w-2.5" /> Conectado
            </span>
          )}
        </div>

        {settings.use_gmail_oauth && settings.gmail_oauth_email ? (
          <div className="flex items-center justify-between bg-secondary/20 rounded-xl p-4 border border-border/10">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Conta conectada</p>
              <p className="text-[13px] font-medium text-foreground mt-0.5">{settings.gmail_oauth_email}</p>
            </div>
            <button
              onClick={handleDisconnectGmail}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-colors"
            >
              <Unlink className="h-3.5 w-3.5" />
              Desconectar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">Google Client ID</label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
                className="bg-secondary/20 border-border/15 h-9 text-[13px] rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">Google Client Secret</label>
              <div className="relative">
                <Input
                  type={showClientSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
                  className="bg-secondary/20 border-border/15 h-9 text-[13px] rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  {showClientSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                Obtenha em <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-primary/70 underline">Google Cloud Console → Credentials</a>
              </p>
            </div>
            <button
              onClick={handleConnectGmail}
              disabled={connectingOAuth || !clientId.trim()}
              className="w-full flex items-center justify-center gap-2.5 h-11 rounded-xl border border-border/20 bg-white dark:bg-secondary/30 text-[13px] font-medium text-foreground hover:bg-secondary/40 transition-all disabled:opacity-50"
            >
              {connectingOAuth ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {connectingOAuth ? "Conectando..." : "Conectar conta Google"}
            </button>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/40">
          Usa a Gmail API para enviar e-mails de recuperação. Não precisa de Senha de App.
        </p>
      </div>


      {/* Test section */}
      <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
          <TestTube className="h-4 w-4 text-primary/60" strokeWidth={1.5} />
          Testar envio
        </h3>
        <div className="flex gap-3">
          <Input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="email@teste.com"
            className="bg-secondary/20 border-border/15 h-9 text-[13px] rounded-xl flex-1"
          />
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/40 text-foreground/70 text-[13px] font-medium hover:bg-secondary/60 border border-border/15 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {testing ? "Enviando..." : "Enviar teste"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/40">
          Envia um e-mail de recuperação de senha de teste para o endereço informado.
        </p>
      </div>
    </motion.div>
  );
}
