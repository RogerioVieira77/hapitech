import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Bot, UsersRound, Plug, Users, MessageSquare, Contact,
  Headset, Settings, CreditCard, FileText, Sun, Moon, LogOut,
} from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { label: "Dashboard", url: "/", icon: LayoutDashboard },
  { label: "Agentes", url: "/agentes", icon: Bot },
  { label: "Equipes", url: "/equipe", icon: UsersRound },
  { label: "Canais", url: "/canais", icon: Plug },
  { label: "CRM", url: "/crm", icon: Users },
  { label: "Chat ao Vivo", url: "/chat", icon: MessageSquare },
  { label: "Contatos", url: "/contacts", icon: Contact },
  { label: "Atendimentos", url: "/atendimentos", icon: Headset },
  { label: "Base de Conhecimento", url: "/knowledge", icon: FileText },
  { label: "Configurações", url: "/configuracoes", icon: Settings },
  { label: "Financeiro", url: "/billing", icon: CreditCard },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const runCommand = useCallback((cmd: () => void) => {
    onOpenChange(false);
    cmd();
  }, [onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar páginas, ações..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Navegação">
          {navItems.map((item) => (
            <CommandItem
              key={item.url + item.label}
              onSelect={() => runCommand(() => navigate(item.url))}
              className="gap-3 py-2.5 px-3 rounded-lg cursor-pointer"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ações">
          <CommandItem
            onSelect={() => runCommand(toggleTheme)}
            className="gap-3 py-2.5 px-3 rounded-lg cursor-pointer"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} /> : <Moon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />}
            <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(signOut)}
            className="gap-3 py-2.5 px-3 rounded-lg cursor-pointer"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span>Sair</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
