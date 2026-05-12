import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization, useUpdateOrg } from "@/hooks/useOrganization";
import { Camera, Mail, User, Shield, Eye, EyeOff, Loader2, Building2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ease = [0.25, 0.46, 0.45, 0.94] as const;

export default function Profile() {
  const { user } = useAuth();
  const { data: orgData } = useOrganization();
  const updateOrg = useUpdateOrg();
  const isOrgOwner = orgData?.org?.owner_id === user?.id;
  const { toast } = useToast();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || "");
  const [avatarUrl, setAvatarUrl] = useState<string>(user?.user_metadata?.avatar_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");

  // Sync orgName when data loads
  useEffect(() => {
    if (orgData?.org?.name) setOrgName(orgData.org.name);
  }, [orgData?.org?.name]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

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

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });
      if (updateError) throw updateError;

      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      setAvatarUrl(publicUrl);
      setPreview(null);
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

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });

    if (!error) {
      await supabase
        .from("profiles")
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    // Save org name if owner and changed
    if (isOrgOwner && orgData?.org && orgName !== orgData.org.name) {
      updateOrg.mutate({ id: orgData.org.id, updates: { name: orgName } as any });
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Perfil atualizado!" });
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não coincidem", description: "A nova senha e a confirmação devem ser iguais.", variant: "destructive" });
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

  const currentAvatar = preview || avatarUrl;
  const initials = (displayName || user?.email || "U")
    .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <PageTransition>
      <div className="space-y-8 w-full max-w-3xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="pt-2"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground/50 mt-1">{t("profile.subtitle")}</p>
        </motion.div>

        {/* Avatar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease }}
        >
          <Card className="border border-border/15 bg-card rounded-3xl shadow-none">
            <CardContent className="p-6">
              <div className="flex items-center gap-6">
                <div className="relative shrink-0">
                  <motion.div
                    whileHover={{ scale: 1.03 }}
                    className="h-20 w-20 rounded-full bg-muted/30 border border-border/15 overflow-hidden flex items-center justify-center cursor-pointer select-none"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <AnimatePresence mode="wait">
                      {currentAvatar ? (
                        <motion.img key="photo" src={currentAvatar} alt="Foto de perfil" initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="h-full w-full object-cover" />
                      ) : (
                        <motion.span key="initials" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xl font-bold text-muted-foreground/50 select-none">{initials}</motion.span>
                      )}
                    </AnimatePresence>
                    <motion.div initial={{ opacity: 0 }} whileHover={{ opacity: 1 }} className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                      <Camera className="h-6 w-6 text-white" strokeWidth={1.5} />
                    </motion.div>
                  </motion.div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-foreground flex items-center justify-center border-2 border-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 text-background animate-spin" /> : <Camera className="h-3.5 w-3.5 text-background" />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFileChange} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{displayName || user?.email?.split("@")[0] || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground/40 mt-0.5">{user?.email}</p>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="mt-2 text-xs text-foreground/50 hover:text-foreground transition-colors disabled:opacity-40">
                    {uploading ? t("profile.uploading") : t("profile.changePhoto")}
                  </button>
                  <p className="text-[10px] text-muted-foreground/30 mt-1">{t("profile.photoFormats")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Personal Info */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease }}
        >
          <Card className="border border-border/15 bg-card rounded-3xl shadow-none">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 rounded-xl bg-muted/40">
                  <User className="h-4 w-4 text-foreground/50" strokeWidth={1.5} />
                </div>
                <p className="text-[13px] font-semibold text-foreground">{t("profile.personalInfo")}</p>
              </div>
              <div className="h-px bg-border/15" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">{t("profile.displayName")}</Label>
                  <Input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder={t("profile.displayName")}
                    className="bg-muted/15 border-border/15 h-10 text-sm rounded-xl"
                    onKeyDown={e => e.key === "Enter" && handleSave()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" /> {t("profile.companyName")}
                  </Label>
                  <Input
                    value={isOrgOwner ? orgName : (orgData?.org?.name || "")}
                    onChange={isOrgOwner ? e => setOrgName(e.target.value) : undefined}
                    readOnly={!isOrgOwner}
                    className={isOrgOwner ? "bg-muted/15 border-border/15 h-10 text-sm rounded-xl" : "bg-muted/10 border-border/10 h-10 text-sm text-muted-foreground/50 cursor-not-allowed rounded-xl"}
                    onKeyDown={isOrgOwner ? e => e.key === "Enter" && handleSave() : undefined}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium flex items-center gap-1.5">
                    <Mail className="h-3 w-3" /> E-mail
                  </Label>
                  <Input
                    value={user?.email || ""}
                    readOnly
                    className="bg-muted/10 border-border/10 h-10 text-sm text-muted-foreground/50 cursor-not-allowed rounded-xl"
                  />
                  <p className="text-[10px] text-muted-foreground/30">{t("profile.emailNote")}</p>
                </div>
              </div>
              <div className="pt-2">
                <Button onClick={handleSave} disabled={saving} className="gap-2 h-10 px-5 rounded-2xl text-sm font-medium btn-accent">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {saving ? t("profile.saving") : t("profile.saveChanges")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security / Password */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18, ease }}
        >
          <Card className="border border-border/15 bg-card rounded-3xl shadow-none">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 rounded-xl bg-muted/40">
                  <Shield className="h-4 w-4 text-foreground/50" strokeWidth={1.5} />
                </div>
                <p className="text-[13px] font-semibold text-foreground">{t("profile.security")}</p>
              </div>
              <div className="h-px bg-border/15" />

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">{t("profile.newPassword")}</Label>
                  <div className="relative">
                    <Input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder={t("profile.passwordMin")}
                      className="bg-muted/15 border-border/15 h-10 text-sm pr-9 rounded-xl"
                    />
                    <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">{t("profile.confirmPassword")}</Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder={t("profile.repeatPassword")}
                      className="bg-muted/15 border-border/15 h-10 text-sm pr-9 rounded-xl"
                      onKeyDown={e => e.key === "Enter" && handleChangePassword()}
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground transition-colors">
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
                        {newPassword === confirmPassword ? t("profile.passwordsMatch") : t("profile.passwordsDontMatch")}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="pt-1">
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !newPassword || !confirmPassword}
                  className="gap-2 h-10 px-5 rounded-2xl text-sm font-medium btn-accent"
                >
                  {changingPassword && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {changingPassword ? t("profile.changing") : t("profile.changePassword")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </PageTransition>
  );
}
