import { useCallback, useRef } from "react";
import { FileText, Upload, Trash2, FileType, FileSpreadsheet, Loader2, Globe, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/PageTransition";
import { useKnowledgeFiles, KnowledgeFile } from "@/hooks/useKnowledgeFiles";
import { useLanguage } from "@/hooks/useLanguage";

const ACCEPTED_TYPES = ".pdf,.txt,.csv";
const ease = [0.25, 0.46, 0.45, 0.94] as const;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(file: KnowledgeFile) {
  if (file.source_type === "website") return <Globe className="h-5 w-5" strokeWidth={1.5} />;
  if (file.file_type === "pdf") return <FileText className="h-5 w-5" strokeWidth={1.5} />;
  if (file.file_type === "csv") return <FileSpreadsheet className="h-5 w-5" strokeWidth={1.5} />;
  return <FileType className="h-5 w-5" strokeWidth={1.5} />;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  if (status === "processing") return <span className="flex items-center gap-1 text-[10px] font-medium text-warning"><Loader2 className="h-3 w-3 animate-spin" />{t("knowledge.processing")}</span>;
  if (status === "ready" || status === "uploaded") return <span className="flex items-center gap-1 text-[10px] font-medium text-success"><CheckCircle2 className="h-3 w-3" />{t("knowledge.ready")}</span>;
  if (status === "error") return <span className="flex items-center gap-1 text-[10px] font-medium text-destructive"><AlertCircle className="h-3 w-3" />{t("knowledge.extractionError")}</span>;
  return <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><Clock className="h-3 w-3" />{status}</span>;
}

export default function Knowledge() {
  const { t } = useLanguage();
  const { files, isLoading, uploading, uploadFiles, deleteFile } = useKnowledgeFiles();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) => { const ext = f.name.split(".").pop()?.toLowerCase(); return ext === "pdf" || ext === "txt" || ext === "csv"; });
    if (dropped.length) uploadFiles(dropped);
  }, [uploadFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    if (selected.length) uploadFiles(selected);
    if (inputRef.current) inputRef.current.value = "";
  }, [uploadFiles]);

  const processingCount = files.filter((f) => f.status === "processing").length;

  return (
    <PageTransition>
      <div className="space-y-10 w-full">
        {/* Header */}
        <motion.div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 page-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
        >
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">{t("knowledge.title")}</h1>
            <p className="text-[13px] text-muted-foreground/40 mt-1.5">{t("knowledge.subtitle")}</p>
          </div>
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="gap-2.5 h-11 px-6 rounded-2xl text-sm font-medium transition-all duration-200 btn-accent"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("knowledge.uploadFile")}
          </Button>
          <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} multiple className="hidden" onChange={handleFileChange} />
        </motion.div>

        {processingCount > 0 && (
          <motion.div
            className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3.5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <p className="text-sm text-primary">{processingCount} {t("knowledge.pdfProcessing")}</p>
          </motion.div>
        )}

        {/* Drop Zone */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease }}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="group relative flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border/30 bg-muted/10 py-10 sm:py-14 cursor-pointer hover:border-border/50 hover:bg-muted/20 transition-all"
          onClick={() => inputRef.current?.click()}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 border border-border/15">
            <Upload className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-sm text-foreground/70 font-medium">{t("knowledge.dragDrop")}</p>
            <p className="text-xs text-muted-foreground/40 mt-1">{t("knowledge.fileTypes")}</p>
            <p className="text-xs text-muted-foreground/30 mt-0.5">{t("knowledge.autoExtract")}</p>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          className="grid gap-5 sm:gap-6 grid-cols-1 sm:grid-cols-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease }}
        >
          {[
            { label: t("knowledge.totalFiles"), value: files.length.toString() },
            { label: t("knowledge.totalSize"), value: formatFileSize(files.reduce((acc, f) => acc + f.file_size, 0)) },
            { label: t("knowledge.types"), value: [...new Set(files.map((f) => f.file_type.toUpperCase()))].join(", ") || "—" },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="p-7">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/40 font-medium">{stat.label}</p>
                <p className="text-2xl font-bold tracking-tight text-foreground mt-2 tabular-nums">{stat.value}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Files List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" /></div>
        ) : files.length === 0 ? (
          <Card className="border border-border/15 bg-card rounded-3xl shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="p-4 rounded-2xl bg-muted/40 mb-4">
                <FileText className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{t("knowledge.noFiles")}</p>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease }}
          >
            {files.map((file, i) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04, ease }}
              >
                <Card className={`border border-border/15 bg-card rounded-2xl shadow-none transition-colors ${file.status === "error" ? "border-destructive/30" : "hover:bg-muted/10"}`}>
                  <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${file.status === "processing" ? "bg-primary/10 text-primary" : file.status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted/30 text-foreground/50"}`}>
                      {file.status === "processing" ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} /> : fileIcon(file)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">{file.file_name}</p>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                        <Badge variant="secondary" className="bg-muted/30 text-foreground/50 border-0 text-[10px] uppercase tracking-wider">{file.file_type}</Badge>
                        <span className="text-[11px] text-muted-foreground/40">{formatFileSize(file.file_size)}</span>
                        {file.content && <span className="text-[11px] text-muted-foreground/40 hidden sm:inline">{(file.content.length / 1000).toFixed(1)}k chars</span>}
                        <StatusBadge status={file.status} />
                      </div>
                      {file.source_url && <p className="text-[10px] text-muted-foreground/30 truncate mt-0.5">{file.source_url}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-destructive" onClick={() => deleteFile(file)}>
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
