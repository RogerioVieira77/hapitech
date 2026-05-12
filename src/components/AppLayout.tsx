import { AppSidebar } from "@/components/AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { Outlet, useNavigate } from "react-router-dom";
import { Search, Bell, Coins, WifiOff, RefreshCw, User, UserCircle, UsersRound, Settings, CreditCard, Crown, Sun, Moon, LogOut, ChevronRight, ChevronDown, Sparkles, Languages, PlayCircle, Headphones, Globe, Key, Menu } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/hooks/useTheme";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage, localeLabels, type Locale } from "@/hooks/useLanguage";
import { useEvolutionApi } from "@/hooks/useEvolutionApi";
import { useWhatsAppConnectionMonitor } from "@/hooks/useWhatsAppConnectionMonitor";
import { useTelegramConnections } from "@/hooks/useTelegramConnections";
import { useTelegramConnectionMonitor } from "@/hooks/useTelegramConnectionMonitor";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationListener } from "@/components/NotificationListener";

// ── Disconnected connections banner ─────────────────────────────────────────
type DisconnectedItem = {
  id: string;
  label: string;
  type: "whatsapp" | "telegram";
};

function DisconnectedBanner({ items }: { items: DisconnectedItem[] }) {
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const { t } = useLanguage();
  const handleReconnectWhatsApp = async (connectionId: string) => {
    setReconnecting(connectionId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      await supabase.functions.invoke("wuzapi-proxy", {
        body: { action: "connect", connectionId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      window.location.href = "/canais";
    } catch {
      window.location.href = "/canais";
    } finally {
      setReconnecting(null);
    }
  };

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div
            className="flex flex-wrap items-center gap-2 px-5 py-2 text-xs"
            style={{
              background: "hsl(var(--destructive) / 0.06)",
              borderBottom: "1px solid hsl(var(--destructive) / 0.15)",
            }}
          >
            <WifiOff className="h-3 w-3 shrink-0 text-destructive" strokeWidth={1.5} />
            <span className="text-destructive/80 font-medium text-[11px]">
              {items.length === 1
                ? `${items[0].type === "telegram" ? "Bot Telegram" : "WhatsApp"} ${t("banner.disconnected")}: ${items[0].label}`
                : `${items.length} ${t("banner.offlineConnections")}`}
            </span>
            <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    item.type === "whatsapp"
                      ? handleReconnectWhatsApp(item.id)
                      : (window.location.href = "/canais")
                  }
                  disabled={reconnecting === item.id}
                  className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium transition-all"
                  style={{
                    background: "hsl(var(--destructive) / 0.1)",
                    color: "hsl(var(--destructive))",
                    border: "1px solid hsl(var(--destructive) / 0.2)",
                  }}
                >
                  <RefreshCw
                    className={`h-2.5 w-2.5 ${reconnecting === item.id ? "animate-spin" : ""}`}
                    strokeWidth={1.5}
                  />
                  {items.length > 1 ? item.label || t("banner.reconnect") : t("banner.reconnect")}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TopBar({ disconnectedCount, onOpenCommandPalette, onToggleSidebar }: { disconnectedCount: number; onOpenCommandPalette: () => void; onToggleSidebar: () => void }) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLanguage();
  const navigate = useNavigate();
  const { data: profileData } = useQuery({
    queryKey: ["profile_topbar", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, display_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const avatarUrl = profileData?.avatar_url ?? user?.user_metadata?.avatar_url ?? null;
  const displayName = profileData?.display_name ?? user?.user_metadata?.display_name ?? null;

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase.rpc as any)("has_role", { _user_id: user.id, _role: "super_admin" })
      .then(({ data }) => setIsSuperAdmin(!!data));
  }, [user?.id]);

  const { data: creditsData } = useQuery({
    queryKey: ["user_credits_topbar", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_credits")
        .select("balance")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    refetchInterval: 100_000,
  });
  const balance = creditsData?.balance ?? 0;

  const firstName = displayName?.split(" ")[0] || user?.email?.split("@")[0] || "Usuário";
  const lastName = displayName?.split(" ").slice(1).join(" ") || "";
  const companyName = user?.user_metadata?.company_name || "";

  return (
    <div className="relative z-10 shrink-0">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/8">
        {/* Mobile hamburger */}
        <button
          onClick={onToggleSidebar}
          className="md:hidden flex items-center justify-center h-8 w-8 rounded-xl border border-border/10 bg-muted/10 text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 transition-colors shrink-0"
        >
          <Menu className="h-4.5 w-4.5" strokeWidth={1.5} />
        </button>
        <div className="shrink-0 w-1 hidden md:block" />

        {/* Center: Search */}
        <div className="flex-1 max-w-md mx-auto hidden md:block">
          <div
            onClick={onOpenCommandPalette}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2 cursor-pointer transition-all duration-200 border border-border/20 bg-card/80 hover:bg-card hover:border-border/30 shadow-[0_1px_3px_-1px_hsl(230_20%_15%/0.04)]"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" strokeWidth={1.8} />
            <span className="text-[12px] text-muted-foreground/45 truncate">{t("topbar.search")}</span>
            <kbd className="ml-auto text-[9px] text-muted-foreground/30 font-mono hidden lg:inline bg-muted/30 px-1.5 py-0.5 rounded-md border border-border/15">⌘K</kbd>
          </div>
        </div>

        <div className="flex-1 md:hidden" />

        {/* Right: actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Credits pill */}
          <button
            onClick={() => navigate("/billing")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98] bg-card border border-border/15 shadow-[0_2px_8px_-2px_hsl(0_0%_0%/0.08),0_1px_3px_-1px_hsl(0_0%_0%/0.06)]"
          >
            <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-amber-400/15">
              <Coins className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.2} />
            </div>
            <span className="tabular-nums text-foreground">{balance.toLocaleString("pt-BR")}</span>
          </button>

          <div className="h-7 w-px mx-0.5 hidden sm:block bg-border/12" />

          {/* Profile */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center gap-2.5 cursor-pointer shrink-0 rounded-2xl px-2.5 py-1.5 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] border shadow-[0_2px_8px_-2px_hsl(0_0%_0%/0.08),0_1px_3px_-1px_hsl(0_0%_0%/0.06)] ${
                  popoverOpen
                    ? "border-accent/20 bg-card"
                    : "border-border/15 bg-card hover:border-border/25"
                }`}
              >
                <div className="text-right hidden sm:block">
                  <p className="text-[13px] font-bold text-foreground leading-tight">{firstName}</p>
                  {companyName ? <p className="text-[10px] text-muted-foreground/40 leading-tight">{companyName}</p> : lastName ? <p className="text-[10px] text-muted-foreground/40 leading-tight">{lastName}</p> : null}
                </div>
                <div className="h-9 w-9 rounded-[10px] overflow-hidden ring-2 ring-accent/15 shadow-[0_0_0_1px_hsl(var(--accent)/0.08)]">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={avatarUrl ?? undefined} alt="Avatar" className="object-cover" />
                    <AvatarFallback className="bg-accent/12 text-accent text-[11px] font-bold">
                      {firstName ? firstName.charAt(0).toUpperCase() : <User className="h-4 w-4" strokeWidth={1.5} />}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/35 transition-transform duration-200 ${popoverOpen ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="w-56 p-0 rounded-xl z-50 border border-border/15 bg-popover overflow-hidden"
              style={{
                boxShadow: '0 16px 48px -12px hsl(0 0% 0% / 0.4), 0 6px 16px -6px hsl(0 0% 0% / 0.2)',
              }}
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-border/10">
                <div className="flex items-center gap-2.5">
                  <Avatar className="h-8 w-8 rounded-[8px]">
                    <AvatarImage src={avatarUrl ?? undefined} alt="Avatar" className="object-cover" />
                    <AvatarFallback className="bg-accent/8 text-accent text-[10px] font-semibold rounded-[8px]">
                      {firstName ? firstName.charAt(0).toUpperCase() : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-foreground truncate">
                      {displayName || user?.email?.split("@")[0] || "Usuário"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/35 truncate">{user?.email ?? ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-lg bg-muted/10">
                  <Coins className="h-3 w-3 text-amber-400" strokeWidth={2} />
                  <span className="text-[11px] font-semibold text-foreground tabular-nums">{balance.toLocaleString("pt-BR")} créditos</span>
                </div>
              </div>

              <div className="py-1">
                {/* Language */}
                <div className="relative">
                  <button
                    onClick={() => setLangOpen(v => !v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/10 transition-colors rounded-lg mx-1 w-[calc(100%-8px)]"
                  >
                    <span className="flex items-center gap-2.5">
                      <Languages className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {t("dropdown.language")}
                    </span>
                    <span className="text-[10px] text-muted-foreground/35 bg-muted/20 px-1.5 py-0.5 rounded">{locale}</span>
                  </button>
                  <AnimatePresence>
                    {langOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mx-2 mb-1 rounded-lg border border-border/10 bg-muted/8 overflow-hidden"
                      >
                        {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                          <button
                            key={loc}
                            onClick={() => { setLocale(loc); setLangOpen(false); }}
                            className={`flex w-full items-center px-3 py-1.5 text-[12px] transition-colors ${
                              locale === loc
                                ? "bg-accent/8 text-accent font-semibold"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
                            }`}
                          >
                            {loc}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Theme */}
                <button
                  onClick={() => toggleTheme()}
                  className="flex w-full items-center justify-between px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/10 transition-colors rounded-lg mx-1 w-[calc(100%-8px)]"
                >
                  <span className="flex items-center gap-2.5">
                    {theme === "dark" ? <Moon className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Sun className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    {t("dropdown.theme")}
                  </span>
                  <span className="text-[10px] text-muted-foreground/35 bg-muted/20 px-1.5 py-0.5 rounded">{theme === "dark" ? "Dark" : "Light"}</span>
                </button>

                <div className="my-1 mx-3 border-t border-border/8" />

                {[
                  { icon: Key, label: t("dropdown.apiKey"), onClick: () => { setPopoverOpen(false); navigate("/configuracoes"); } },
                  { icon: Headphones, label: t("dropdown.support"), onClick: () => setPopoverOpen(false) },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.onClick}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/10 transition-colors rounded-lg mx-1 w-[calc(100%-8px)]"
                  >
                    <item.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {item.label}
                  </button>
                ))}

                {isSuperAdmin && (
                  <>
                    <div className="my-1 mx-3 border-t border-border/8" />
                    <button
                      onClick={() => { setPopoverOpen(false); navigate("/super-admin"); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-accent/70 hover:text-accent hover:bg-accent/4 transition-colors rounded-lg mx-1 w-[calc(100%-8px)]"
                    >
                      <Crown className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {t("nav.superAdmin")}
                    </button>
                  </>
                )}

                <div className="my-1 mx-3 border-t border-border/8" />

                <button
                  onClick={() => { setPopoverOpen(false); signOut(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] text-muted-foreground hover:text-destructive hover:bg-destructive/4 transition-colors rounded-lg mx-1 w-[calc(100%-8px)]"
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {t("dropdown.signOut")}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

// ── Root monitor wrapper ───────────────────────
function AppLayoutInner() {
  const { connections: whatsappConns } = useEvolutionApi();
  const { connections: telegramConns } = useTelegramConnections();

  useWhatsAppConnectionMonitor(whatsappConns);
  useTelegramConnectionMonitor(telegramConns);

  const disconnectedItems: DisconnectedItem[] = [
    ...whatsappConns
      .filter(c => !c.is_connected)
      .map(c => ({
        id: c.id,
        label: c.phone_number?.replace(/-[a-f0-9]{12,}$/, "") || "WhatsApp",
        type: "whatsapp" as const,
      })),
    ...telegramConns
      .filter(c => !c.is_connected && c.bot_token)
      .map(c => ({
        id: c.id,
        label: c.bot_name || c.bot_username || "Bot",
        type: "telegram" as const,
      })),
  ];

  const [cmdOpen, setCmdOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background relative overflow-hidden">
      <NotificationListener />
      <AppSidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />
        <div className={`flex flex-col flex-1 h-screen overflow-hidden p-0 md:py-2.5 md:pr-2.5 transition-[margin] duration-300 ${sidebarCollapsed ? "md:ml-[68px]" : "md:ml-[220px]"}`}>
          <div className="flex flex-col flex-1 overflow-hidden md:rounded-2xl md:border md:border-border/12 bg-card md:shadow-[0_1px_4px_-1px_hsl(230_20%_15%/0.04),0_4px_16px_-4px_hsl(230_20%_15%/0.05)]">
            <TopBar disconnectedCount={disconnectedItems.length} onOpenCommandPalette={() => setCmdOpen(true)} onToggleSidebar={() => setSidebarOpen(v => !v)} />
            <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
            <DisconnectedBanner items={disconnectedItems} />
            <main className="flex-1 overflow-auto w-full bg-background/40 flex flex-col min-h-0">
              <div className="p-3 sm:p-5 lg:p-7 w-full flex-1 min-h-0 flex flex-col">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
    </div>
  );
}

export function AppLayout() {
  return <AppLayoutInner />;
}
