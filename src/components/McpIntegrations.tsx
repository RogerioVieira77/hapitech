import { useState, useRef } from "react";
import { Plus, ExternalLink, Link2, Upload, ArrowLeft, Loader2, Trash2, MoreVertical, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import n8nLogo from "@/assets/mcp/n8n.png";
import canvaLogo from "@/assets/mcp/canva.jpg";
import shopifyLogo from "@/assets/mcp/shopify.svg";
import zapierLogo from "@/assets/mcp/zapier.png";
import vapiLogo from "@/assets/mcp/vapi.jpg";
import notionLogo from "@/assets/mcp/notion.jpg";

interface McpConnection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  server_url: string;
  server_type: string;
  auth_type: string | null;
  is_connected: boolean;
  preset_key: string | null;
  created_at: string;
  updated_at: string;
}

const PRESET_MCPS = [
  {
    key: "n8n",
    name: "n8n",
    description: "Integre seu agente ao n8n e desbloqueie todo o potencial das suas automações.",
    logo: n8nLogo,
    available: true,
    urlPlaceholder: "https://seun8n.com/mcp/********",
    externalUrl: "https://docs.n8n.io/advanced-ai/accessing-n8n-mcp-server/",
  },
  {
    key: "canva",
    name: "Canva",
    description: "Crie novos designs vazios, encontrar seus designs existentes e exportá-los como PDFs ou imagens.",
    logo: canvaLogo,
    available: false,
    urlPlaceholder: "",
    externalUrl: "https://canva.com",
  },
  {
    key: "shopify",
    name: "Shopify",
    description: "Seu agente vendendo por você e criando carrinhos sob medida para cada cliente.",
    logo: shopifyLogo,
    available: true,
    urlPlaceholder: "https://sua-loja.myshopify.com/mcp",
    externalUrl: "https://shopify.com",
  },
  {
    key: "zapier",
    name: "Zapier",
    description: "Conecte seu agente a mais de 8 mil ferramentas com zapier.",
    logo: zapierLogo,
    available: true,
    urlPlaceholder: "https://actions.zapier.com/mcp/********",
    externalUrl: "https://zapier.com",
  },
  {
    key: "vapi",
    name: "Vapi",
    description: "Crie agentes de voz pela vapi e permita que seu agente inicie ligações.",
    logo: vapiLogo,
    available: true,
    urlPlaceholder: "https://mcp.vapi.ai/mcp",
    externalUrl: "https://vapi.ai",
  },
  {
    key: "notion",
    name: "Notion",
    description: "Conecte o Notion MCP e habilite suas IAs a ler, escrever e automatizar documentos, tarefas e relatórios.",
    logo: notionLogo,
    available: true,
    urlPlaceholder: "https://mcp.notion.com/mcp",
    externalUrl: "https://notion.so",
  },
];

const STORAGE_KEY = "mcp_connections_local";

function getLocalConnections(userId: string): McpConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as McpConnection[];
    return all.filter(c => c.user_id === userId);
  } catch {
    return [];
  }
}

function saveLocalConnections(connections: McpConnection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

function useMyMcpConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [useLocal, setUseLocal] = useState(false);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["mcp_connections", user?.id, useLocal],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Try Supabase first
      if (!useLocal) {
        try {
          const { data, error } = await (supabase as any)
            .from("mcp_connections")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          if (error) {
            console.warn("mcp_connections table not available, using localStorage:", error.message);
            setUseLocal(true);
            return getLocalConnections(user.id);
          }
          return (data || []) as McpConnection[];
        } catch {
          setUseLocal(true);
          return getLocalConnections(user.id);
        }
      }
      
      return getLocalConnections(user.id);
    },
    enabled: !!user?.id,
  });

  const createConnection = useMutation({
    mutationFn: async (conn: {
      name: string;
      description?: string;
      icon_url?: string;
      server_url: string;
      server_type?: string;
      auth_type?: string;
      preset_key?: string;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");
      
      if (!useLocal) {
        const { error } = await (supabase as any).from("mcp_connections").insert({
          user_id: user.id,
          name: conn.name,
          description: conn.description || null,
          icon_url: conn.icon_url || null,
          server_url: conn.server_url,
          server_type: conn.server_type || "streamable_http",
          auth_type: conn.auth_type || null,
          preset_key: conn.preset_key || null,
          is_connected: true,
        });
        if (error) {
          console.warn("Falling back to localStorage for MCP:", error.message);
          setUseLocal(true);
        } else {
          return;
        }
      }
      
      // localStorage fallback
      const newConn: McpConnection = {
        id: crypto.randomUUID(),
        user_id: user.id,
        name: conn.name,
        description: conn.description || null,
        icon_url: conn.icon_url || null,
        server_url: conn.server_url,
        server_type: conn.server_type || "streamable_http",
        auth_type: conn.auth_type || null,
        is_connected: true,
        preset_key: conn.preset_key || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const existing = getLocalConnections(user.id);
      saveLocalConnections([newConn, ...existing]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp_connections"] });
      toast.success("Servidor MCP conectado com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      if (!useLocal) {
        const { error } = await (supabase as any).from("mcp_connections").delete().eq("id", id);
        if (error) {
          console.warn("Falling back to localStorage for delete:", error.message);
          setUseLocal(true);
        } else {
          return;
        }
      }
      
      // localStorage fallback
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const all = JSON.parse(raw) as McpConnection[];
        saveLocalConnections(all.filter(c => c.id !== id));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp_connections"] });
      toast.success("Conexão MCP removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { connections, isLoading, createConnection, deleteConnection };
}

type ModalStep = "list" | "connect-preset" | "create-custom";

export function McpIntegrations() {
  const { connections, isLoading, createConnection, deleteConnection } = useMyMcpConnections();
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<ModalStep>("list");
  const [selectedPreset, setSelectedPreset] = useState<typeof PRESET_MCPS[0] | null>(null);

  // Preset connect form
  const [presetUrl, setPresetUrl] = useState("");

  // Custom form
  const [customName, setCustomName] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customType, setCustomType] = useState("streamable_http");
  const [customAuth, setCustomAuth] = useState("none");
  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      toast.error("Ícone muito grande. Máximo 500KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCustomIcon(reader.result as string);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setPresetUrl("");
    setCustomName("");
    setCustomDesc("");
    setCustomUrl("");
    setCustomType("streamable_http");
    setCustomAuth("none");
    setCustomIcon(null);
    setSelectedPreset(null);
    setStep("list");
  };

  const openModal = () => { resetForm(); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); resetForm(); };

  const handleConnectPreset = () => {
    if (!selectedPreset || !presetUrl.trim()) return;
    createConnection.mutate({
      name: selectedPreset.name,
      description: selectedPreset.description,
      icon_url: selectedPreset.logo,
      server_url: presetUrl.trim(),
      preset_key: selectedPreset.key,
    }, { onSuccess: closeModal });
  };

  const handleCreateCustom = () => {
    if (!customName.trim() || !customUrl.trim()) return;
    createConnection.mutate({
      name: customName.trim(),
      description: customDesc.trim() || undefined,
      icon_url: customIcon || undefined,
      server_url: customUrl.trim(),
      server_type: customType,
      auth_type: customAuth === "none" ? undefined : customAuth,
    }, { onSuccess: closeModal });
  };

  // Check which presets are already connected
  const connectedPresets = new Set(connections.filter(c => c.preset_key).map(c => c.preset_key));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Servidores MCP</h2>
          <p className="text-xs text-muted-foreground/50">
            Conecte seu agente de IA com servidores MCP e permita que ele acesse dados e outras ferramentas de forma segura.
          </p>
        </div>
        <Button size="sm" onClick={openModal} className="gap-1.5">
          <Plus className="h-4 w-4" /> Conectar servidor MCP
        </Button>
      </div>

      {/* Connected MCP list */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-2xl border border-border/20 px-5 py-10 flex flex-col items-center gap-3" style={{ background: 'hsl(var(--card))' }}>
          <div className="flex items-center gap-2">
            {[n8nLogo, zapierLogo, notionLogo].map((logo, i) => (
              <div key={i} className="h-10 w-10 rounded-xl bg-secondary/20 border border-border/15 flex items-center justify-center">
                <img src={logo} className="h-6 w-6 object-contain rounded opacity-40" />
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground/40">Nenhum servidor MCP conectado</p>
          <Button size="sm" onClick={openModal} className="gap-1.5 mt-1">
            <Plus className="h-3.5 w-3.5" /> Conectar servidor MCP
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/20 overflow-hidden" style={{ background: 'hsl(var(--card))' }}>
          <div className="divide-y divide-border/10">
            {connections.map(conn => {
              const preset = PRESET_MCPS.find(p => p.key === conn.preset_key);
              const logo = preset?.logo || conn.icon_url;
              return (
                <div key={conn.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/10 transition-colors">
                  <div className="h-9 w-9 rounded-xl bg-secondary/20 border border-border/15 flex items-center justify-center shrink-0 overflow-hidden">
                    {logo ? (
                      <img src={logo} className="h-6 w-6 object-contain rounded" alt="" />
                    ) : (
                      <Link2 className="h-4 w-4 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate">{conn.name}</p>
                    <p className="text-[11px] text-muted-foreground/40 truncate">{conn.description || conn.server_url}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] font-medium text-green-500">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    Conectado
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => deleteConnection.mutate(conn.id)} className="gap-2.5 text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={closeModal}>
        <DialogContent className="max-w-lg p-0 overflow-hidden border-border/30 shadow-2xl" style={{ background: 'hsl(var(--card))' }}>
          <AnimatePresence mode="wait">
            {/* Step 1: List of available MCPs */}
            {step === "list" && (
              <motion.div key="list" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.15 }}>
                <div className="px-6 pt-6 pb-4 border-b border-border/15">
                  <p className="text-[16px] font-bold">Conectar servidor MCP</p>
                </div>
                <div className="max-h-[420px] overflow-y-auto py-2">
                  {PRESET_MCPS.map(preset => {
                    const alreadyConnected = connectedPresets.has(preset.key);
                    return (
                      <div key={preset.key} className="flex items-center gap-3.5 px-6 py-3 hover:bg-secondary/10 transition-colors">
                        <div className="h-10 w-10 rounded-xl bg-secondary/20 border border-border/15 flex items-center justify-center shrink-0 overflow-hidden">
                          <img src={preset.logo} className="h-7 w-7 object-contain rounded" alt="" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[13px] font-semibold">{preset.name}</p>
                            <a href={preset.externalUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/30 hover:text-primary transition-colors">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <p className="text-[11px] text-muted-foreground/50 leading-snug">{preset.description}</p>
                        </div>
                        {!preset.available ? (
                          <span className="text-[11px] text-muted-foreground/35 shrink-0">⏳ Em breve</span>
                        ) : alreadyConnected ? (
                          <span className="text-[11px] text-green-500/70 font-medium shrink-0">✓ Conectado</span>
                        ) : (
                          <Button size="sm" variant="outline" className="gap-1.5 shrink-0 text-xs h-8 border-primary/30 text-primary hover:bg-primary/5"
                            onClick={() => { setSelectedPreset(preset); setStep("connect-preset"); }}>
                            <Link2 className="h-3 w-3" /> Conectar
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="px-6 py-4 border-t border-border/15 flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground/40">Não encontrou na lista acima?</span>
                  <Button size="sm" className="gap-1.5 text-xs" onClick={() => setStep("create-custom")}>
                    <Plus className="h-3 w-3" /> Criar conexão MCP
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Connect preset */}
            {step === "connect-preset" && selectedPreset && (
              <motion.div key="preset" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }}>
                <div className="px-6 pt-6 pb-5">
                  <div className="flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-xl bg-secondary/20 border border-border/15 flex items-center justify-center shrink-0 overflow-hidden">
                      <img src={selectedPreset.logo} className="h-8 w-8 object-contain rounded" alt="" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold">{selectedPreset.name}</p>
                      <p className="text-[11px] text-muted-foreground/50">{selectedPreset.description}</p>
                    </div>
                  </div>
                </div>
                <div className="px-6 pb-6 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[12px] font-semibold text-foreground/70">URL do servidor</Label>
                    <Input
                      value={presetUrl}
                      onChange={e => setPresetUrl(e.target.value)}
                      placeholder={selectedPreset.urlPlaceholder}
                      className="h-10 text-sm border-border/30 font-mono"
                      style={{ background: 'hsl(var(--secondary) / 0.15)' }}
                      onKeyDown={e => e.key === "Enter" && handleConnectPreset()}
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button onClick={() => { setStep("list"); setSelectedPreset(null); setPresetUrl(""); }} className="text-[12px] text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors">
                      <ArrowLeft className="h-3 w-3" /> Voltar
                    </button>
                    <Button onClick={handleConnectPreset} disabled={createConnection.isPending || !presetUrl.trim()} className="gap-2 font-semibold">
                      {createConnection.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      CONECTAR SERVIDOR MCP
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Custom MCP */}
            {step === "create-custom" && (
              <motion.div key="custom" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }}>
                <div className="px-6 pt-6 pb-4 border-b border-border/15">
                  <p className="text-[16px] font-bold">Conectar servidor MCP</p>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-end gap-3">
                    <div>
                      <Label className="text-[12px] font-semibold text-foreground/70">Ícone</Label>
                      <input
                        ref={iconInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleIconUpload}
                        className="hidden"
                      />
                      <div
                        onClick={() => {
                          if (customIcon) {
                            setCustomIcon(null);
                          } else {
                            iconInputRef.current?.click();
                          }
                        }}
                        title={customIcon ? "Clique para remover" : "Clique para enviar ícone"}
                        className="mt-1.5 h-10 w-10 rounded-lg border border-dashed border-border/40 flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors overflow-hidden relative group"
                      >
                        {customIcon ? (
                          <>
                            <img src={customIcon} alt="" className="h-full w-full object-cover rounded-lg group-hover:opacity-30 transition-opacity" />
                            <X className="h-3.5 w-3.5 text-destructive absolute opacity-0 group-hover:opacity-100 transition-opacity" />
                          </>
                        ) : (
                          <Upload className="h-3.5 w-3.5 text-muted-foreground/30" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <Label className="text-[12px] font-semibold text-foreground/70">Nome</Label>
                      <Input
                        value={customName}
                        onChange={e => setCustomName(e.target.value)}
                        placeholder="Ferramenta personalizada"
                        className="h-10 text-sm border-border/30 mt-1.5"
                        style={{ background: 'hsl(var(--secondary) / 0.15)' }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-semibold text-foreground/70">Descrição</Label>
                    <Textarea
                      value={customDesc}
                      onChange={e => setCustomDesc(e.target.value)}
                      placeholder="Explique o que isso faz em poucas palavras"
                      className="text-sm border-border/30 min-h-[60px] resize-none"
                      style={{ background: 'hsl(var(--secondary) / 0.15)' }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[12px] font-semibold text-foreground/70">Tipo</Label>
                      <Select value={customType} onValueChange={setCustomType}>
                        <SelectTrigger className="h-10 text-sm border-border/30" style={{ background: 'hsl(var(--secondary) / 0.15)' }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="streamable_http">Streamable Http</SelectItem>
                          <SelectItem value="sse">SSE</SelectItem>
                          <SelectItem value="stdio">Stdio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px] font-semibold text-foreground/70">URL do servidor MCP</Label>
                      <Input
                        value={customUrl}
                        onChange={e => setCustomUrl(e.target.value)}
                        placeholder="https://mcp.example.com/mcp"
                        className="h-10 text-sm border-border/30 font-mono"
                        style={{ background: 'hsl(var(--secondary) / 0.15)' }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-semibold text-foreground/70">Autenticação</Label>
                    <Select value={customAuth} onValueChange={setCustomAuth}>
                      <SelectTrigger className="h-10 text-sm border-border/30" style={{ background: 'hsl(var(--secondary) / 0.15)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        <SelectItem value="oauth">OAuth</SelectItem>
                        <SelectItem value="api_key">API Key</SelectItem>
                        <SelectItem value="bearer">Bearer Token</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button onClick={() => setStep("list")} className="text-[12px] text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors">
                      <ArrowLeft className="h-3 w-3" /> Voltar
                    </button>
                    <Button onClick={handleCreateCustom} disabled={createConnection.isPending || !customName.trim() || !customUrl.trim()} className="gap-2 font-semibold">
                      {createConnection.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      SALVAR SERVIDOR MCP
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </div>
  );
}
