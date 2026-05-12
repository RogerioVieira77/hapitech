import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Plus, Minus, RefreshCw, Search, X, Loader2, TrendingDown, TrendingUp, History, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

interface UserWithCredits {
  id: string;
  email: string;
  display_name: string | null;
  balance: number;
}

interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string | null;
  model_id: string | null;
  created_at: string;
  user_email?: string;
}

function getInitials(name: string | null, email: string) {
  if (name) return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return email.charAt(0).toUpperCase();
}

export function CreditsTab({ users }: { users: { id: string; email: string; display_name: string | null }[] }) {
  const { t } = useLanguage();
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);

  const loadCredits = useCallback(async () => {
    setLoadingCredits(true);
    try {
      const { data } = await supabase
        .from("user_credits" as any)
        .select("user_id, balance");
      const map: Record<string, number> = {};
      if (data) {
        (data as unknown as { user_id: string; balance: number }[]).forEach(r => {
          map[r.user_id] = r.balance;
        });
      }
      setCredits(map);
    } finally {
      setLoadingCredits(false);
    }
  }, []);

  useEffect(() => {
    loadCredits();
    const interval = setInterval(loadCredits, 100_000);
    return () => clearInterval(interval);
  }, [loadCredits]);

  const loadTransactions = useCallback(async (userId: string) => {
    setLoadingTx(true);
    try {
      const { data } = await supabase
        .from("credit_transactions" as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      setTransactions((data as unknown as Transaction[]) || []);
    } finally {
      setLoadingTx(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUser) loadTransactions(selectedUser);
  }, [selectedUser, loadTransactions]);

  const applyCredits = async (userId: string, operation: "add" | "subtract" | "set") => {
    const raw = inputValues[userId];
    const amount = parseInt(raw || "0");
    if (isNaN(amount) || amount < 0) {
      toast.error(t("credits.invalidValue"));
      return;
    }
    setProcessing(userId);
    try {
      const { data, error } = await (supabase.rpc as any)("set_user_credits", {
        _user_id: userId,
        _amount: amount,
        _operation: operation,
        _description: operation === "set" ? t("credits.setByAdmin") : operation === "add" ? t("credits.addedByAdmin") : t("credits.removedByAdmin"),
      });
      if (error) throw error;
      const result = data as { success: boolean; balance: number };
      if (!result.success) throw new Error(t("credits.updateFailed"));
      setCredits(prev => ({ ...prev, [userId]: result.balance }));
      setInputValues(prev => ({ ...prev, [userId]: "" }));
      if (selectedUser === userId) loadTransactions(userId);
      toast.success(`${t("credits.updated")}: ${result.balance} ${t("credits.creditsUnit")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("credits.updateError"));
    } finally {
      setProcessing(null);
    }
  };

  const filteredUsers = users.filter(u =>
    (u.email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (u.display_name?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const selectedUserData = users.find(u => u.id === selectedUser);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary/60" strokeWidth={1.5} />
            {t("credits.title")}
          </h2>
          <p className="text-[11px] text-muted-foreground/40 mt-0.5">
            {t("credits.subtitle")}
          </p>
        </div>
        <button
          onClick={loadCredits}
          disabled={loadingCredits}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary/40 text-foreground/50 hover:bg-secondary/70 border border-border/15 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${loadingCredits ? "animate-spin" : ""}`} />
          {t("credits.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <Input
              placeholder={t("credits.searchUser")}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 bg-secondary/20 border-border/15 h-9 text-[13px] rounded-xl"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl overflow-hidden">
            {filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Users className="h-7 w-7 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground/40">{t("credits.noUsers")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/8 max-h-[480px] overflow-y-auto">
                {filteredUsers.map(u => {
                  const balance = credits[u.id] ?? null;
                  const inputVal = inputValues[u.id] ?? "";
                  const isProcessing = processing === u.id;
                  const isSelected = selectedUser === u.id;

                  return (
                    <motion.div
                      key={u.id}
                      layout
                      className={`px-4 py-3 transition-colors cursor-pointer ${isSelected ? "bg-primary/5 border-l-2 border-primary/40" : "hover:bg-secondary/10"}`}
                      onClick={() => setSelectedUser(isSelected ? null : u.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-secondary/60 border border-border/20 flex items-center justify-center text-[11px] font-bold text-foreground/60 shrink-0">
                          {getInitials(u.display_name, u.email)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground/80 truncate">
                            {u.display_name || u.email.split("@")[0]}
                          </p>
                          <p className="text-[11px] text-muted-foreground/40 truncate">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {balance === null ? (
                            <span className="text-[11px] text-muted-foreground/30 px-2 py-1 rounded-lg bg-secondary/20">{t("credits.noBalance")}</span>
                          ) : (
                            <span className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                              balance > 50 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : balance > 10 ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-destructive/10 text-destructive/70 border-destructive/20"
                            }`}>
                              <Coins className="h-3 w-3" />
                              {balance}
                            </span>
                          )}
                        </div>
                      </div>

                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="mt-3 space-y-2">
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder={t("credits.amount")}
                                  value={inputVal}
                                  onChange={e => setInputValues(prev => ({ ...prev, [u.id]: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && applyCredits(u.id, "set")}
                                  className="bg-secondary/20 border-border/15 h-9 text-[13px] rounded-xl flex-1"
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-1.5">
                                <button
                                  onClick={() => applyCredits(u.id, "add")}
                                  disabled={isProcessing || !inputVal}
                                  className="flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors disabled:opacity-40"
                                >
                                  {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                  {t("credits.add")}
                                </button>
                                <button
                                  onClick={() => applyCredits(u.id, "subtract")}
                                  disabled={isProcessing || !inputVal}
                                  className="flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-lg bg-destructive/10 text-destructive/70 hover:bg-destructive/20 border border-destructive/20 transition-colors disabled:opacity-40"
                                >
                                  <Minus className="h-3 w-3" />
                                  {t("credits.remove")}
                                </button>
                                <button
                                  onClick={() => applyCredits(u.id, "set")}
                                  disabled={isProcessing || !inputVal}
                                  className="flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors disabled:opacity-40"
                                >
                                  {t("credits.set")}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            {selectedUserData ? `${t("credits.historyFor")} — ${selectedUserData.display_name || selectedUserData.email.split("@")[0]}` : t("credits.history")}
          </h3>

          <div className="rounded-2xl border border-border/15 bg-card/40 backdrop-blur-xl overflow-hidden min-h-[200px]">
            {!selectedUser ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <History className="h-7 w-7 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground/40">{t("credits.selectUser")}</p>
              </div>
            ) : loadingTx ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">{t("common.loading")}</span>
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <History className="h-6 w-6 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground/40">{t("credits.noTransactions")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/8 max-h-[480px] overflow-y-auto">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                      tx.amount > 0 ? "bg-emerald-500/10" : "bg-destructive/10"
                    }`}>
                      {tx.amount > 0
                        ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        : <TrendingDown className="h-3.5 w-3.5 text-destructive/60" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground/70 truncate">
                        {tx.description || (tx.type === "deduct" ? t("credits.aiUsage") : t("credits.adjustment"))}
                      </p>
                      {tx.model_id && (
                        <p className="text-[10px] text-muted-foreground/40 font-mono truncate">{tx.model_id}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[13px] font-semibold tabular-nums ${tx.amount > 0 ? "text-emerald-400" : "text-destructive/70"}`}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </p>
                      <p className="text-[10px] text-muted-foreground/40 tabular-nums">
                        {t("credits.balance")}: {tx.balance_after}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/30 tabular-nums whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
