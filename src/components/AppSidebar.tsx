import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  MessageSquare,
  Bell,
  CheckCheck,
  ArrowRightLeft,
  X,
  CalendarClock,
  AlertCircle,
  Info,
  Coins,
  Headset,
  CreditCard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useUserRole, type EffectiveRole } from "@/hooks/useUserRole";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import mvoLogo from "@/assets/mvo-logo-new.png";
import { customIcons } from "@/assets/custom-icons";
import { ThemedIcon } from "@/components/ui/themed-icon";

/* ── Notification icon map ──────────────────────────── */
const notifIconMap: Record<string, { icon: LucideIcon; cls: string }> = {
  transfer: { icon: ArrowRightLeft, cls: "text-accent bg-accent/12" },
  reminder: { icon: CalendarClock, cls: "text-warning bg-warning/12" },
  system: { icon: AlertCircle, cls: "text-destructive bg-destructive/12" },
  info: { icon: Info, cls: "text-success bg-success/12" },
  credit: { icon: Coins, cls: "text-accent bg-accent/12" },
  message: { icon: MessageSquare, cls: "text-info bg-info/12" },
};
const defaultNotifIcon = { icon: Bell, cls: "text-accent bg-accent/12" };

/* ── Types ──────────────────────────────────────────── */
type RoleFilter = EffectiveRole[];
interface NavItem {
  key: string;
  url: string;
  icon?: LucideIcon;
  iconSrc?: string;
  roles?: RoleFilter;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { key: "nav.dashboard", url: "/", iconSrc: customIcons.iconChartPie, roles: ["super_admin", "admin", "user"] },
  { key: "nav.chat", url: "/chat", iconSrc: customIcons.iconMessage },
  { key: "nav.agents", url: "/agentes", iconSrc: customIcons.iconDevice, roles: ["super_admin", "admin"] },
  { key: "nav.contacts", url: "/contacts", iconSrc: customIcons.iconPhone },
  { key: "nav.crm", url: "/crm", iconSrc: customIcons.iconSignpost },
  { key: "nav.tasks", url: "/tarefas", iconSrc: customIcons.iconChecklist, roles: ["super_admin", "admin", "user"] },
  { key: "nav.trainings", url: "#", iconSrc: customIcons.iconCalendarNote, disabled: true },
  { key: "nav.teams", url: "/equipe", iconSrc: customIcons.iconUser, roles: ["super_admin", "admin"] },
  { key: "nav.connections", url: "/canais", iconSrc: customIcons.iconGlobe, roles: ["super_admin", "admin"] },
  { key: "nav.reports", url: "/relatorios", iconSrc: customIcons.iconDocument, roles: ["super_admin", "admin"] },
];

const moreItems: NavItem[] = [
  { key: "nav.more_atendimentos", url: "/atendimentos", icon: Headset, roles: ["super_admin", "admin"] },
  { key: "nav.more_billing", url: "/billing", icon: CreditCard, roles: ["super_admin", "admin"] },
  { key: "nav.more_settings", url: "/configuracoes", icon: Settings, roles: ["super_admin", "admin", "user"] },
];

function filterByRole(items: NavItem[], role: EffectiveRole) {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

/* ── Main component ─────────────────────────────────── */
export function AppSidebar({
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onToggleCollapse,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { t } = useLanguage();
  const menuLabel = t("nav.menu");
  const resolvedMenuLabel = menuLabel === "nav.menu" ? "Menu" : menuLabel;
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: userRole } = useUserRole();
  const effectiveRole: EffectiveRole = userRole ?? "user";
  const visibleNavItems = filterByRole(navItems, effectiveRole);
  const visibleMoreItems = filterByRole(moreItems, effectiveRole);

  const isActive = (item: NavItem) => !item.disabled && (item.url === "/" ? location.pathname === "/" : location.pathname.startsWith(item.url));

  const renderNavIcon = (item: NavItem, active: boolean, size = "h-[16px] w-[16px]") => {
    if (item.iconSrc) {
      return (
        <ThemedIcon
          src={item.iconSrc}
          alt=""
          className={`${size} transition-all duration-200 group-hover:scale-110 ${active ? "opacity-100" : "opacity-85"}`}
        />
      );
    }
    if (item.icon) {
      const IconComp = item.icon;
      return <IconComp className={`transition-all duration-200 group-hover:scale-110 ${size}`} strokeWidth={active ? 2.2 : 1.6} />;
    }
    return null;
  };

  const SidebarBtn = ({ item, active }: { item: NavItem; active: boolean }) => (
    <button
      type="button"
      onClick={() => {
        if (item.disabled) return;
        navigate(item.url);
        onMobileClose?.();
      }}
      disabled={item.disabled}
      title={collapsed ? t(item.key) : undefined}
      className={`group relative flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full px-3 py-2.5 rounded-xl transition-all duration-200
        ${
          active
            ? "sidebar-btn-active"
            : item.disabled
              ? "text-sidebar-foreground/50 cursor-default"
              : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
        }`}
    >
      <div
        className={`shrink-0 flex items-center justify-center rounded-lg transition-all duration-200 ${
          active ? "h-8 w-8 bg-accent/15 text-accent" : "h-8 w-8 group-hover:bg-sidebar-accent/60"
        }`}
      >
        {renderNavIcon(item, active, active ? "h-[17px] w-[17px]" : "h-[16px] w-[16px]")}
      </div>
      {!collapsed && (
        <span
          className={`truncate ${
            active
              ? "text-[13px] font-semibold tracking-[-0.01em] text-accent"
              : "text-[12.5px] font-medium tracking-[-0.005em] text-sidebar-foreground/90"
          }`}
        >
          {t(item.key)}
        </span>
      )}
      {active && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.5)]"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );

  return (
    <>
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <nav
        className={`sidebar-shell fixed top-0 left-0 h-screen flex flex-col z-40 transition-all duration-300
          ${collapsed ? "w-[68px]" : "w-[220px]"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className={`relative h-[64px] flex items-center ${collapsed ? "justify-center px-2" : "px-5"} shrink-0 border-b border-sidebar-border/30`}>
          <img src={mvoLogo} alt="Meu Vendedor Online" className={`${collapsed ? "h-10" : "h-14"} w-auto object-contain transition-all duration-300`} />
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 items-center justify-center rounded-lg border border-sidebar-border/30 bg-sidebar-accent/35 hover:bg-sidebar-accent/65 transition-colors"
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              <ThemedIcon
                src={customIcons.iconChevronRight}
                alt=""
                className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
              />
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-0.5 px-2.5 py-3 overflow-y-auto scrollbar-none">
          {!collapsed && <p className="text-[9px] font-bold text-muted-foreground/72 uppercase tracking-[0.12em] px-3 mb-2 mt-1">{resolvedMenuLabel}</p>}
          {visibleNavItems.map((item) => (
            <SidebarBtn key={item.key} item={item} active={isActive(item)} />
          ))}

          {visibleMoreItems.length > 0 && (
            <>
              <div className="sidebar-separator my-2 mx-3" />
              {!collapsed && <p className="text-[10px] font-semibold text-muted-foreground/74 uppercase tracking-[0.08em] px-3 mb-1.5 mt-1">{t("nav.more_options") || "Mais"}</p>}
              {visibleMoreItems.map((item) => (
                <SidebarBtn key={item.key} item={item} active={isActive(item)} />
              ))}
            </>
          )}
        </div>

        <div className="flex flex-col gap-1 px-2.5 py-3 shrink-0 border-t border-sidebar-border/30">
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <button
                className={`group relative flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full px-3 py-2.5 rounded-xl transition-all duration-200 text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/40`}
              >
                <div className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg group-hover:bg-sidebar-accent/60 transition-all duration-200">
                  <ThemedIcon src={customIcons.iconSound} alt="" className="h-[16px] w-[16px]" invertInDark={false} />
                </div>
                {!collapsed && <span className="text-[12.5px] font-medium tracking-[-0.005em]">Notificações</span>}
                {unreadCount > 0 && (
                  <span
                    className={`${collapsed ? "absolute top-1.5 right-2" : "ml-auto"} flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[9px] font-bold bg-accent text-accent-foreground px-1 shadow-[0_0_8px_hsl(var(--accent)/0.4)]`}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end" sideOffset={12} className="sidebar-popover w-[320px] p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
                <p className="text-[13px] font-semibold text-foreground">Notificações</p>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent/80 transition-colors">
                    <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
                    Marcar lidas
                  </button>
                )}
              </div>
              <ScrollArea className="max-h-[340px]">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2.5">
                    <div className="h-10 w-10 rounded-full bg-muted/20 flex items-center justify-center">
                      <ThemedIcon src={customIcons.iconInbox} alt="" className="h-4 w-4 opacity-60" />
                    </div>
                    <p className="text-[11px] text-muted-foreground/30 font-medium">Nenhuma notificação</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {notifications.map((notif) => {
                      const mapping = notifIconMap[notif.type] ?? defaultNotifIcon;
                      const IconComp = mapping.icon;
                      return (
                        <div
                          key={notif.id}
                          className={`group/item flex items-start gap-2.5 px-4 py-2.5 transition-colors cursor-pointer hover:bg-muted/15 ${!notif.is_read ? "bg-accent/3" : ""}`}
                          onClick={() => {
                            if (!notif.is_read) markAsRead(notif.id);
                            if (notif.metadata?.conversation_id) {
                              navigate("/chat");
                              setNotifOpen(false);
                            }
                          }}
                        >
                          <div className={`flex items-center justify-center h-7 w-7 rounded-[8px] shrink-0 mt-0.5 ${!notif.is_read ? mapping.cls : "bg-muted/20 text-muted-foreground/30"}`}>
                            <IconComp className="h-3.5 w-3.5" strokeWidth={1.6} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-[12px] leading-tight ${!notif.is_read ? "font-semibold text-foreground" : "font-medium text-foreground/55"}`}>
                                {notif.title}
                              </p>
                              {!notif.is_read && <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 mt-1.5" />}
                            </div>
                            {notif.message && <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-2">{notif.message}</p>}
                            <p className="text-[9px] text-muted-foreground/25 mt-1">
                              {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notif.id);
                            }}
                            className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground/20 hover:text-destructive shrink-0"
                          >
                            <X className="h-3 w-3" strokeWidth={1.6} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
    </>
  );
}
