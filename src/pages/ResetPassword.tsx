import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, ArrowRight, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import mvoLogo from "@/assets/mvo-logo-new.png";

function getPasswordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const strengthColors = ["", "bg-red-500", "bg-amber-500", "bg-blue-500", "bg-emerald-500"];
const strengthLabels = ["", "Fraca", "Razoável", "Boa", "Forte"];

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  useEffect(() => {
    // Listen for the SIGNED_IN event with type=recovery from the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success("Senha redefinida com sucesso!");
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen min-h-[100dvh] bg-gradient-to-br from-[#1e3a8a] via-[#2563EB] to-[#3b82f6] p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-white/[0.04] rounded-full blur-3xl" />
        <div className="absolute -bottom-48 -right-48 w-[600px] h-[600px] bg-blue-400/[0.06] rounded-full blur-3xl" />
      </div>

      <motion.div
        className="relative w-full max-w-md bg-white rounded-[1.75rem] p-8 sm:p-10 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.35)]"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <img src={mvoLogo} alt="Meu Vendedor Online" className="w-36 mb-8 object-contain" />

        {success ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
            <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Senha redefinida!</h1>
            <p className="mt-2 text-[13px] text-gray-400">Você será redirecionado em instantes...</p>
          </motion.div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Redefinir senha</h1>
            <p className="mt-1 text-[13px] text-gray-400">Digite sua nova senha abaixo.</p>

            <form onSubmit={handleReset} className="mt-7 space-y-5">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Nova senha</label>
                <div className="flex items-center h-11 rounded-xl bg-gray-50 border border-gray-100 px-3.5 transition-all duration-200 focus-within:bg-white focus-within:border-[#2563EB]/30 focus-within:ring-2 focus-within:ring-[#2563EB]/10">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-300 outline-none"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1} className="text-gray-400 hover:text-gray-600 transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${strength >= i ? strengthColors[strength] : "bg-gray-100"}`} />
                      ))}
                    </div>
                    <p className={`text-[10px] font-semibold ${strength <= 1 ? "text-red-400" : strength === 2 ? "text-amber-400" : strength === 3 ? "text-blue-500" : "text-emerald-500"}`}>
                      {strengthLabels[strength]}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Confirmar senha</label>
                <div className="flex items-center h-11 rounded-xl bg-gray-50 border border-gray-100 px-3.5 transition-all duration-200 focus-within:bg-white focus-within:border-[#2563EB]/30 focus-within:ring-2 focus-within:ring-[#2563EB]/10">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-300 outline-none"
                  />
                </div>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="mt-1.5 text-[10px] font-semibold text-red-400">As senhas não coincidem</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || password.length < 6 || !passwordsMatch}
                className="group w-full rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] h-11 text-[13px] font-semibold text-white transition-all hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Redefinindo..." : "Redefinir senha"}
                {!loading && <ArrowRight className="h-4 w-4 opacity-60 group-hover:translate-x-0.5 transition-transform" />}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
