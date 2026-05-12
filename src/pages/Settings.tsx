import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Camera, Eye, EyeOff, Loader2, Copy, Check, Key, ExternalLink, RefreshCw, Bell, BellOff, Monitor, Rows3 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";
import { Separator } from "@/components/ui/separator";
import { SecurityTab } from "@/components/SecurityTab";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const { settings, loading, saving, updateSetting } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || "");
  const [companyName, setCompanyName] = useState(user?.user_metadata?.company_name || "");
  const [whatsappNumber, setWhatsappNumber] = useState(user?.user_metadata?.whatsapp_number || "");
  const [avatarUrl, setAvatarUrl] = useState<string>(user?.user_metadata?.avatar_url || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [profilePassword, setProfilePassword] = useState("");

  // Workspace state
  const [workspaceName, setWorkspaceName] = useState(user?.user_metadata?.workspace_name || "Meu Workspace");
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // API Key state
  const [apiToken, setApiToken] = useState<string>("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) setApiToken(data.session.access_token);
    });
  }, []);

  const handleCopyToken = async () => {
    await navigator.clipboard.writeText(apiToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleRegenerateToken = async () => {
    setRegenerating(true);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      const newToken = data?.session?.access_token;
      if (newToken) {
        setApiToken(newToken);
        toast({ title: "Token atualizado com sucesso!" });
      } else {
        toast({ title: "Erro", description: "Não foi possível obter um novo token.", variant: "destructive" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro ao alterar token", description: msg, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  const currentAvatar = preview || avatarUrl;
  const initials = (displayName || user?.email || "U")
    .split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      if (updateError) throw updateError;
      await supabase.from("profiles").update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      setAvatarUrl(publicUrl);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["profile_topbar"] });
      toast({ title: "Foto atualizada com sucesso!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro ao enviar foto", description: msg, variant: "destructive" });
      setPreview(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName, company_name: companyName, whatsapp_number: whatsappNumber },
    });
    if (!error) {
      await supabase.from("profiles").update({ display_name: displayName, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    }
    setSavingProfile(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["profile_topbar"] });
      toast({ title: "Perfil atualizado!" });
      setProfilePassword("");
    }
  };

  const handleSaveWorkspace = async () => {
    if (!user) return;
    setSavingWorkspace(true);
    const { error } = await supabase.auth.updateUser({ data: { workspace_name: workspaceName } });
    setSavingWorkspace(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Workspace atualizado!" });
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha alterada com sucesso!" });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <PageTransition>
      <div className="flex-1 min-h-full p-6 md:p-10">
        <div className="w-full space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">{t("settings.title")}</h1>
            <p className="text-[13px] text-muted-foreground/40 mt-1.5">
              {t("settings.subtitle")}
              {saving && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/40">
                  <Loader2 className="h-3 w-3 animate-spin" /> {t("common.saving")}
                </span>
              )}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
          >

          <Tabs defaultValue="perfil" className="w-full">
            <div className="flex gap-1 bg-muted/30 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto">
              <TabsList className="bg-transparent p-0 h-auto w-full sm:w-auto">
                <TabsTrigger value="perfil" className="text-[13px] py-2 px-3 sm:px-5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium text-muted-foreground flex-1 sm:flex-initial">
                  Perfil
                </TabsTrigger>
                <TabsTrigger value="senha" className="text-[13px] py-2 px-3 sm:px-5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium text-muted-foreground flex-1 sm:flex-initial">
                  Senha
                </TabsTrigger>
                <TabsTrigger value="seguranca" className="text-[13px] py-2 px-3 sm:px-5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium text-muted-foreground flex-1 sm:flex-initial">
                  Segurança
                </TabsTrigger>
                <TabsTrigger value="api" className="text-[13px] py-2 px-3 sm:px-5 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground font-medium text-muted-foreground flex-1 sm:flex-initial">
                  <Key className="h-3.5 w-3.5 mr-1.5" /> API
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ─── Perfil ─── */}
            <TabsContent value="perfil" className="mt-6">
              <div className="bg-card rounded-3xl border border-border/15 shadow-none p-6 md:p-8 space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-6">
                  <div className="relative shrink-0">
                    <Avatar className="h-24 w-24 border-2 border-border/15">
                      <AvatarImage src={currentAvatar} alt="Avatar" />
                      <AvatarFallback className="text-xl font-bold bg-muted/30 text-muted-foreground/60">{initials}</AvatarFallback>
                    </Avatar>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFileChange} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">{displayName || user?.email?.split("@")[0]}</p>
                    <p className="text-xs text-muted-foreground/40">{user?.email}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="rounded-xl text-xs gap-1.5 border-border/15 bg-muted/20 hover:bg-muted/40 shadow-none"
                    >
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                      Alterar foto
                    </Button>
                  </div>
                </div>

                <Separator className="opacity-15" />

                {/* Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium">Nome</Label>
                    <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Seu nome completo" className="bg-muted/15 border-border/15 h-10 text-sm rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium">Nome da empresa</Label>
                    <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nome da sua empresa" className="bg-muted/15 border-border/15 h-10 text-sm rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium">Número de Whatsapp</Label>
                    <Input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="(00) 00000-0000" className="bg-muted/15 border-border/15 h-10 text-sm rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium">E-mail</Label>
                    <Input value={user?.email || ""} readOnly className="bg-muted/10 border-border/10 h-10 text-sm text-muted-foreground/40 cursor-not-allowed rounded-xl" />
                  </div>
                </div>

                <Separator className="opacity-15" />

                {/* Notification sound toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-muted/30">
                      {settings.notif_sound ? (
                        <Bell className="h-4 w-4 text-foreground/60" strokeWidth={1.5} />
                      ) : (
                        <BellOff className="h-4 w-4 text-muted-foreground/40" strokeWidth={1.5} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Som de notificação</p>
                      <p className="text-[11px] text-muted-foreground/50">Toca um som ao receber novas notificações</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("notif_sound", !settings.notif_sound)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.notif_sound ? "bg-primary" : "bg-muted/40"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                      settings.notif_sound ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

                {/* Desktop notifications toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-muted/30">
                      <Monitor className={`h-4 w-4 ${settings.notif_desktop ? "text-foreground/60" : "text-muted-foreground/40"}`} strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Notificações desktop</p>
                      <p className="text-[11px] text-muted-foreground/50">Exibe notificações nativas do navegador</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!settings.notif_desktop && "Notification" in window && Notification.permission !== "granted") {
                        Notification.requestPermission().then(p => {
                          if (p === "granted") updateSetting("notif_desktop", true);
                        });
                      } else {
                        updateSetting("notif_desktop", !settings.notif_desktop);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.notif_desktop ? "bg-primary" : "bg-muted/40"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                      settings.notif_desktop ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

                {/* Compact mode */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-muted/30">
                      <Rows3 className={`h-4 w-4 ${settings.compact_mode ? "text-foreground/60" : "text-muted-foreground/40"}`} strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground/80">Modo Compacto</p>
                      <p className="text-[11px] text-muted-foreground/50">Lista de conversas mais densa</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("compact_mode", !settings.compact_mode)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.compact_mode ? "bg-primary" : "bg-muted/40"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                      settings.compact_mode ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="h-11 px-8 rounded-2xl text-sm font-semibold btn-accent"
                  >
                    {savingProfile && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Aplicar Alterações
                  </Button>
                </div>
              </div>
            </TabsContent>


            {/* ─── Senha ─── */}
            <TabsContent value="senha" className="mt-6">
              <div className="bg-card rounded-3xl border border-border/15 shadow-none p-6 md:p-8 space-y-6">
                <div className="max-w-md space-y-5">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium">Nova senha</Label>
                    <div className="relative">
                      <Input
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Digite uma nova senha"
                        className="bg-muted/15 border-border/15 h-10 text-sm pr-10 rounded-xl"
                      />
                      <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground">
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium">Confirme a nova senha</Label>
                    <div className="relative">
                      <Input
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Digite novamente a nova senha"
                        className="bg-muted/15 border-border/15 h-10 text-sm pr-10 rounded-xl"
                        onKeyDown={e => e.key === "Enter" && handleChangePassword()}
                      />
                      <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground">
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <AnimatePresence>
                      {confirmPassword && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={`text-[10px] ${newPassword === confirmPassword ? "text-emerald-500" : "text-destructive"}`}
                        >
                          {newPassword === confirmPassword ? "Senhas coincidem ✓" : "Senhas não coincidem"}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <Button
                    onClick={handleChangePassword}
                    disabled={changingPassword || !newPassword || !confirmPassword}
                    className="h-11 px-8 rounded-2xl text-sm font-semibold btn-accent"
                  >
                    {changingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Alterar Senha
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="seguranca" className="mt-6">
              <SecurityTab />
            </TabsContent>

            {/* ─── API ─── */}
            <TabsContent value="api" className="mt-6">
              <div className="bg-card rounded-3xl border border-border/15 shadow-none p-6 md:p-8 space-y-6">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="p-2 rounded-xl bg-muted/30">
                      <Key className="h-4 w-4 text-foreground/60" />
                    </div>
                    <h2 className="text-[15px] font-semibold">API para desenvolvedores</h2>
                  </div>
                  <p className="text-[12px] text-muted-foreground/40 mt-1.5 ml-11">
                    Crie e edite agentes, faça treinamentos e converse via API.
                  </p>
                </div>

                <div className="rounded-2xl border border-border/10 bg-muted/10 p-5 space-y-4">
                  <p className="text-[11px] text-muted-foreground/35 leading-relaxed">
                    Não compartilhe sua chave de API com outras pessoas nem a exponha no navegador ou em outro código do lado do cliente. A fim de proteger a segurança da sua conta, o sistema também pode alternar automaticamente sua chave de API que tenha vazado publicamente.
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] text-muted-foreground/40 uppercase tracking-wider font-medium">Token:</Label>
                      <button
                        onClick={handleRegenerateToken}
                        disabled={regenerating}
                        className="flex items-center gap-1.5 text-[11px] text-foreground/60 hover:text-foreground transition-colors"
                      >
                        {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Alterar token
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-muted/20 border border-border/10 rounded-xl px-4 py-2.5 overflow-hidden">
                        <p className="text-[11px] font-mono text-muted-foreground/50 truncate select-all">
                          {apiToken || "Carregando..."}
                        </p>
                      </div>
                      <Button
                        onClick={handleCopyToken}
                        disabled={!apiToken}
                        className="shrink-0 gap-2 h-10 px-5 rounded-xl btn-accent"
                      >
                        {tokenCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {tokenCopied ? "Copiado!" : "Copiar"}
                      </Button>
                    </div>
                  </div>

                  <a
                    href="#"
                    className="inline-flex items-center gap-1.5 text-[11px] text-foreground/50 hover:text-foreground transition-colors"
                  >
                    Ver documentação <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </TabsContent>


          </Tabs>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
