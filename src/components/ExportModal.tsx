import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { exportReport } from "@/lib/export.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, Download, FileText, FileSpreadsheet, FileJson, FileArchive, CheckCircle2 } from "lucide-react";

type Format = "pdf" | "xlsx" | "csv" | "json";
type ReportType = "executive" | "technical" | "complete";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scanId: string;
  host: string;
  scanCompleted: boolean;
}

const SECTIONS: { key: string; label: string }[] = [
  { key: "executiveSummary", label: "Resumo executivo" },
  { key: "scores", label: "Scores" },
  { key: "diagnosis", label: "Diagnóstico geral" },
  { key: "topIssues", label: "Top 10 problemas críticos" },
  { key: "issuesByCategory", label: "Problemas por categoria" },
  { key: "pages", label: "Páginas rastreadas" },
  { key: "aiReport", label: "Parecer IA" },
  { key: "roadmap", label: "Roadmap" },
  { key: "technicalRecommendations", label: "Recomendações técnicas" },
  { key: "technicalData", label: "Dados técnicos" },
];

const defaultSections = () => Object.fromEntries(SECTIONS.map((s) => [s.key, true])) as Record<string, boolean>;

function suggestName(host: string) {
  const slug = host.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const d = new Date().toISOString().slice(0, 10);
  return `seo-report-${slug}-${d}`;
}

export function ExportModal({ open, onOpenChange, scanId, host, scanCompleted }: Props) {
  const fn = useServerFn(exportReport);
  const [format, setFormat] = useState<Format>("pdf");
  const [reportType, setReportType] = useState<ReportType>("complete");
  const [sections, setSections] = useState<Record<string, boolean>>(defaultSections);
  const [fileName, setFileName] = useState(suggestName(host));
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleExport = async () => {
    if (!scanCompleted) {
      toast.error("Relatório disponível após a conclusão da análise.");
      return;
    }
    setState("loading");
    try {
      const res = await fn({
        data: { scanId, format, reportType, sections, fileName: fileName.trim() || suggestName(host) },
      });
      // decode base64 -> blob -> download
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState("done");
      toast.success("Download iniciado");
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      setState("error");
      toast.error(e instanceof Error ? e.message : "Erro ao gerar arquivo");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  const formatOptions: { value: Format; label: string; icon: React.ReactNode }[] = [
    { value: "pdf", label: "PDF", icon: <FileText className="h-4 w-4" /> },
    { value: "xlsx", label: "Excel", icon: <FileSpreadsheet className="h-4 w-4" /> },
    { value: "csv", label: "CSV", icon: <FileArchive className="h-4 w-4" /> },
    { value: "json", label: "JSON", icon: <FileJson className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Centro de Exportação</DialogTitle>
          <DialogDescription>
            {scanCompleted ? "Escolha o formato, tipo e conteúdo do relatório." : "Relatório disponível após a conclusão da análise."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Formato</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {formatOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setFormat(o.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition ${
                    format === o.value ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:border-primary/50"
                  }`}
                >
                  {o.icon}
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Tipo de relatório</Label>
            <RadioGroup value={reportType} onValueChange={(v) => setReportType(v as ReportType)} className="grid grid-cols-3 gap-2">
              {(["executive", "technical", "complete"] as const).map((t) => (
                <label
                  key={t}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${
                    reportType === t ? "border-primary bg-primary/10" : "border-border/60"
                  }`}
                >
                  <RadioGroupItem value={t} />
                  {t === "executive" ? "Executivo" : t === "technical" ? "Técnico" : "Completo"}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Conteúdo a incluir</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SECTIONS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 rounded-md border border-border/40 bg-card/30 p-2 text-sm">
                  <Checkbox
                    checked={sections[s.key]}
                    onCheckedChange={(c) => setSections((prev) => ({ ...prev, [s.key]: Boolean(c) }))}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="filename" className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Nome do arquivo</Label>
            <Input id="filename" value={fileName} onChange={(e) => setFileName(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">A extensão será adicionada automaticamente.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleExport} disabled={state === "loading" || !scanCompleted}>
            {state === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {state === "done" && <CheckCircle2 className="mr-2 h-4 w-4" />}
            {state === "idle" && <Download className="mr-2 h-4 w-4" />}
            {state === "loading" ? "Gerando..." : state === "done" ? "Download iniciado" : state === "error" ? "Erro — tentar novamente" : "Gerar Exportação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
