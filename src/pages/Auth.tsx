import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Star, ArrowRight, Sparkles, Shield, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";
import mvoLogo from "@/assets/mvo-logo-new.png";

type View = "login" | "signup" | "invite" | "forgot" | "verify-code";

function getPasswordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const strengthLabels: Record<string, string[]> = {
  "pt-br": ["", "Fraca", "Razoável", "Boa", "Forte"],
  en: ["", "Weak", "Fair", "Good", "Strong"],
  es: ["", "Débil", "Regular", "Buena", "Fuerte"],
  fr: ["", "Faible", "Passable", "Bonne", "Fort"],
  "zh-tw": ["", "弱", "一般", "好", "強"],
  it: ["", "Debole", "Discreta", "Buona", "Forte"],
};
const strengthColors = ["", "bg-red-500", "bg-amber-500", "bg-blue-500", "bg-emerald-500"];

const testimonials = [
  {
    name: "Dra. Maria Silva",
    role: "Diretora da Odonto Excellence",
    text: "O Meu Vendedor Online revolucionou nossa comunicação com pacientes. O chatbot com IA resolve 80% das consultas automaticamente.",
    avatar: "MS",
  },
  {
    name: "Carlos Mendes",
    role: "CEO da TechSales Brasil",
    text: "Desde que implementamos o Meu Vendedor Online, nossas vendas aumentaram 45%. A automação inteligente é incrível.",
    avatar: "CM",
  },
  {
    name: "Ana Rodrigues",
    role: "Gerente de Atendimento",
    text: "A integração multicanal transformou nosso suporte. Agora atendemos WhatsApp, Instagram e Telegram de um só lugar.",
    avatar: "AR",
  },
];

const features = [
  { icon: Zap, label: "Automação Inteligente" },
  { icon: Shield, label: "Segurança Total" },
  { icon: Sparkles, label: "IA Avançada" },
];

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const isInvite = searchParams.get("invite") === "true";
  const inviteEmail = searchParams.get("email") || "";
  const [view, setView] = useState<View>(isInvite ? "invite" : "login");

  const [showPassword, setShowPassword] = useState(false);
  const { locale, t } = useLanguage();

  const [signupPassword, setSignupPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupOrgName, setSignupOrgName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteName, setInviteName] = useState("");
  const passwordStrength = useMemo(() => getPasswordStrength(signupPassword), [signupPassword]);
  const invitePasswordStrength = useMemo(() => getPasswordStrength(invitePassword), [invitePassword]);
  const isEmailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail), [signupEmail]);

  const [forgotEmail, setForgotEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const newPasswordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const [activeTestimonial, setActiveTestimonial] = useState(0);


  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await signIn(form.get("email") as string, form.get("password") as string);
      navigate("/");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp(signupEmail, signupPassword, signupName, signupOrgName || signupName);
      toast.success(t("auth.accountCreated"));
      setView("login");
      setSignupPassword("");
      setSignupEmail("");
      setSignupName("");
      setSignupOrgName("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-recovery-email", {
        body: { email: forgotEmail },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Código de verificação enviado!");
      setView("verify-code");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (newPassword.length < 1) {
      toast.error("Digite uma senha");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-recovery-code", {
        body: { email: forgotEmail.trim(), code: recoveryCode.replace(/\D/g, ""), new_password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Senha alterada com sucesso! Faça login.");
      setRecoveryCode("");
      setNewPassword("");
      setConfirmNewPassword("");
      setForgotEmail("");
      setView("login");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("accept-invite", {
        body: { email: inviteEmail, password: invitePassword, name: inviteName.trim() },
      });
      if (fnError) throw new Error(fnError.message || "Erro ao aceitar convite");
      if (data?.error) throw new Error(data.error);
      await signIn(inviteEmail, invitePassword);
      toast.success("Conta criada com sucesso!");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen min-h-[100dvh] bg-gradient-to-br from-[#1e3a8a] via-[#2563EB] to-[#3b82f6] p-4 sm:p-6 lg:p-10">
      {/* Floating orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-white/[0.04] rounded-full blur-3xl" />
        <div className="absolute -bottom-48 -right-48 w-[600px] h-[600px] bg-blue-400/[0.06] rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-indigo-300/[0.05] rounded-full blur-3xl" />
      </div>

      {/* Main container */}
      <motion.div
        className="relative flex w-full max-w-[1140px] min-h-[620px] rounded-[1.75rem] overflow-hidden shadow-[0_25px_60px_-12px_rgba(0,0,0,0.35)] border border-white/[0.08]"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >

        {/* ── Left: White form panel ──────────────── */}
        <motion.div
          className="flex flex-col justify-center flex-1 bg-white px-8 sm:px-12 lg:px-14 py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          {/* Logo */}
          <img src={mvoLogo} alt="Meu Vendedor Online" className="w-36 mb-8 object-contain self-start" />

          <AnimatePresence mode="wait">
            {view === "invite" ? (
              <motion.div key="invite" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Aceitar convite</h1>
                <p className="mt-1 text-[13px] text-gray-400">Preencha seus dados para ativar sua conta</p>

                <form onSubmit={handleInviteLogin} className="mt-7 space-y-5">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">E-mail</label>
                    <div className="border-b border-gray-200 pb-2.5 px-1">
                      <span className="text-sm text-gray-500">{inviteEmail}</span>
                    </div>
                  </div>
                  <FloatingField label={t("auth.name")} name="name" placeholder={t("auth.namePlaceholder")} value={inviteName} onChange={setInviteName} />
                  <div>
                    <FloatingField
                      label={t("auth.password")}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Crie sua senha"
                      minLength={6}
                      value={invitePassword}
                      onChange={setInvitePassword}
                      suffix={
                        <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1} className="text-gray-400 hover:text-gray-600 transition-colors">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                    <PasswordStrengthBar strength={invitePasswordStrength} locale={locale} show={invitePassword.length > 0} />
                  </div>
                  <SubmitButton loading={loading} disabled={invitePassword.length < 6 || !inviteName.trim()}>
                    {loading ? t("auth.creating") : "Criar conta"}
                  </SubmitButton>
                </form>
                <p className="mt-6 text-center text-[13px] text-gray-400">
                  Já tem uma conta?{" "}
                  <button onClick={() => setView("login")} className="text-[#2563EB] font-semibold hover:underline">Entrar</button>
                </p>
              </motion.div>
            ) : view === "forgot" ? (
              <motion.div key="forgot" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Recuperar senha</h1>
                <p className="mt-1 text-[13px] text-gray-400">Digite seu e-mail e enviaremos um código de verificação.</p>

                <form onSubmit={handleForgotPassword} className="mt-7 space-y-5">
                  <FloatingField label="E-mail" name="email" type="email" placeholder="seu@email.com" value={forgotEmail} onChange={setForgotEmail} />
                  <SubmitButton loading={loading} disabled={!forgotEmail.trim()}>
                    {loading ? "Enviando..." : "Enviar código de verificação"}
                  </SubmitButton>
                </form>

                <p className="mt-6 text-center text-[13px] text-gray-400">
                  Lembrou a senha?{" "}
                  <button onClick={() => setView("login")} className="text-[#2563EB] font-semibold hover:underline">Voltar ao login</button>
                </p>
              </motion.div>
            ) : view === "verify-code" ? (
              <motion.div key="verify-code" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Nova senha</h1>
                <p className="mt-1 text-[13px] text-gray-400">
                  Digite o código de 6 dígitos enviado e sua nova senha.
                </p>

                <form onSubmit={handleVerifyCode} className="mt-7 space-y-5">
                  <FloatingField
                    label="Código de verificação"
                    name="code"
                    type="text"
                    placeholder="000000"
                    value={recoveryCode}
                    onChange={setRecoveryCode}
                  />
                  <div>
                    <FloatingField
                      label="Nova senha"
                      name="new_password"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={setNewPassword}
                      suffix={
                        <button type="button" onClick={() => setShowNewPassword((v) => !v)} tabIndex={-1} className="text-gray-400 hover:text-gray-600 transition-colors">
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                    <PasswordStrengthBar strength={newPasswordStrength} locale={locale} show={newPassword.length > 0} />
                  </div>
                  <FloatingField
                    label="Confirmar nova senha"
                    name="confirm_password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmNewPassword}
                    onChange={setConfirmNewPassword}
                  />
                  <SubmitButton loading={loading} disabled={recoveryCode.replace(/\D/g, "").length !== 6 || newPassword.length < 1 || newPassword !== confirmNewPassword}>
                    {loading ? "Alterando..." : "Alterar senha"}
                  </SubmitButton>
                </form>

                <p className="mt-6 text-center text-[13px] text-gray-400">
                  <button onClick={() => setView("forgot")} className="text-[#2563EB] font-semibold hover:underline">Reenviar código</button>
                  {" · "}
                  <button onClick={() => setView("login")} className="text-[#2563EB] font-semibold hover:underline">Voltar ao login</button>
                </p>
              </motion.div>
            ) : view === "login" ? (
              <motion.div key="login" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Olá, Bem-vindo 👋</h1>
                <p className="mt-1 text-[13px] text-gray-400">Digite as informações de acesso para continuar.</p>

                <form onSubmit={handleSignIn} className="mt-7 space-y-5">
                  <FloatingField label="E-mail" name="email" type="email" placeholder="seu@email.com" />
                  <FloatingField
                    label="Senha"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    suffix={
                      <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1} className="text-gray-400 hover:text-gray-600 transition-colors">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" className="h-[15px] w-[15px] rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]/30" />
                      <span className="text-[13px] text-gray-400 group-hover:text-gray-500 transition-colors">Lembrar de mim</span>
                    </label>
                    <button type="button" onClick={() => setView("forgot")} className="text-[13px] text-[#2563EB] hover:text-[#1D4ED8] font-medium transition-colors">
                      Esqueceu a senha?
                    </button>
                  </div>

                  <SubmitButton loading={loading}>
                    {loading ? t("auth.entering") : "Entrar"}
                  </SubmitButton>
                </form>

                <div className="mt-5 flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] text-gray-400 font-medium">ou</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>


                <p className="mt-5 text-center text-[13px] text-gray-400">
                  {t("auth.noAccount")}{" "}
                  <button onClick={() => setView("signup")} className="text-[#2563EB] font-semibold hover:underline">
                    {t("auth.createAccount")}
                  </button>
                </p>
              </motion.div>
            ) : (
              <motion.div key="signup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t("auth.signup")}</h1>
                <p className="mt-1 text-[13px] text-gray-400">{t("auth.signupSubtitle")}</p>

                <form onSubmit={handleSignUp} className="mt-7 space-y-4">
                  <FloatingField label={t("auth.name")} name="displayName" placeholder={t("auth.namePlaceholder")} value={signupName} onChange={setSignupName} />
                  <FloatingField label={t("auth.orgName")} name="orgName" placeholder={t("auth.orgNamePlaceholder")} value={signupOrgName} onChange={setSignupOrgName} required={false} />
                  <FloatingField label={t("auth.email")} name="email" type="email" placeholder={t("auth.emailPlaceholder")} value={signupEmail} onChange={setSignupEmail} />
                  <div>
                    <FloatingField
                      label={t("auth.password")}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={t("auth.passwordPlaceholder")}
                      minLength={6}
                      value={signupPassword}
                      onChange={setSignupPassword}
                      suffix={
                        <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1} className="text-gray-400 hover:text-gray-600 transition-colors">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                    <PasswordStrengthBar strength={passwordStrength} locale={locale} show={signupPassword.length > 0} />
                  </div>
                  <SubmitButton loading={loading} disabled={!isEmailValid || signupPassword.length < 6 || !signupName.trim()}>
                    {loading ? t("auth.creating") : t("auth.createButton")}
                  </SubmitButton>
                </form>
                <p className="mt-6 text-center text-[13px] text-gray-400">
                  {t("auth.hasAccount")}{" "}
                  <button onClick={() => setView("login")} className="text-[#2563EB] font-semibold hover:underline">{t("auth.doLogin")}</button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Right: Hero panel ────────────── */}
        <motion.div
          className="hidden lg:flex flex-1 flex-col justify-between bg-gradient-to-br from-[#2563EB] to-[#1e40af] px-10 xl:px-14 py-10 relative overflow-hidden"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          {/* Decorative shapes */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-80 h-80 bg-white/[0.04] rounded-full -translate-y-1/2 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/[0.03] rounded-full translate-y-1/3 -translate-x-1/4" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-br from-blue-400/[0.08] to-transparent rounded-full" />
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col h-full justify-between">
            {/* Top: Headline */}
            <div>
              <motion.div
                className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3.5 py-1.5 mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span className="text-[11px] font-semibold text-white/90 tracking-wide">Powered by AI</span>
              </motion.div>

              <motion.h2
                className="text-[1.7rem] xl:text-[2rem] font-extrabold text-white leading-[1.15] tracking-tight"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                Venda todos os dias
                <br />
                com Inteligência
                <br />
                <span className="text-blue-200">Artificial</span>
              </motion.h2>

              <motion.p
                className="mt-4 text-[13px] text-white/60 leading-relaxed max-w-[320px]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                Transforme seu atendimento com automação inteligente e comunicação eficaz em múltiplos canais.
              </motion.p>

              {/* Features pills */}
              <motion.div
                className="flex flex-wrap gap-2 mt-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {features.map((f) => (
                  <div key={f.label} className="flex items-center gap-1.5 bg-white/[0.08] backdrop-blur-sm rounded-lg px-3 py-1.5">
                    <f.icon className="h-3.5 w-3.5 text-blue-200" />
                    <span className="text-[11px] font-medium text-white/80">{f.label}</span>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Bottom: Testimonial card */}
            <motion.div
              className="mt-auto"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
            >
              <div className="bg-white/[0.1] backdrop-blur-md rounded-2xl p-5 border border-white/[0.08]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTestimonial}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-300 to-blue-500 flex items-center justify-center text-[11px] font-bold text-white shadow-lg shadow-blue-500/20">
                        {testimonials[activeTestimonial].avatar}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-[13px]">{testimonials[activeTestimonial].name}</p>
                        <p className="text-[11px] text-white/50">{testimonials[activeTestimonial].role}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-3 w-3 text-amber-400 fill-amber-400" />
                        ))}
                      </div>
                    </div>
                    <p className="text-[13px] text-white/70 leading-relaxed italic">
                      "{testimonials[activeTestimonial].text}"
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Dots */}
                <div className="mt-4 flex items-center gap-1.5">
                  {testimonials.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveTestimonial(i)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === activeTestimonial ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────── */

function PasswordStrengthBar({ strength, locale, show }: { strength: number; locale: string; show: boolean }) {
  if (!show) return null;
  return (
    <div className="mt-2.5 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${
              strength >= i ? strengthColors[strength] : "bg-gray-100"
            }`}
          />
        ))}
      </div>
      <p className={`text-[10px] font-semibold ${
        strength <= 1 ? "text-red-400" :
        strength === 2 ? "text-amber-400" :
        strength === 3 ? "text-blue-500" :
        "text-emerald-500"
      }`}>
        {(strengthLabels[locale] || strengthLabels.en)[strength]}
      </p>
    </div>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  minLength?: number;
  suffix?: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
}

function FloatingField({ label, name, type = "text", placeholder, minLength, suffix, value, onChange, required = true }: FieldProps) {
  return (
    <div className="group">
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
      <div className="flex items-center h-11 rounded-xl bg-gray-50 border border-gray-100 px-3.5 transition-all duration-200 focus-within:bg-white focus-within:border-[#2563EB]/30 focus-within:ring-2 focus-within:ring-[#2563EB]/10 focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.06)]">
        <input
          name={name}
          type={type}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-300 outline-none"
        />
        {suffix}
      </div>
    </div>
  );
}

function SubmitButton({ loading, disabled, children }: { loading: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="group w-full rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] h-11 text-[13px] font-semibold text-white transition-all hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
      {!loading && <ArrowRight className="h-4 w-4 opacity-60 group-hover:translate-x-0.5 transition-transform" />}
    </button>
  );
}
