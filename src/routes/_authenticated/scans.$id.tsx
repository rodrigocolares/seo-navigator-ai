import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getScanDetail } from "@/lib/seo-scan.functions";
import { ScoreRing } from "@/components/ScoreRing";
import { ExportModal } from "@/components/ExportModal";
import { ScanProgressPanel } from "@/components/ScanProgressPanel";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, ArrowLeft, ExternalLink, Sparkles, Download, GitCompare, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/scans/$id")({
  component: ScanDetailPage,
});

interface AIReport {
  executive_summary?: string;
  top_issues?: { title: string; severity: string; why_it_matters: string; how_to_fix: string }[];
  quick_wins?: string[];
  roadmap?: { week: string; tasks: string[] }[];
  seo_recommendations?: string[];
  ux_recommendations?: string[];
}

function ScanDetailPage() {
  const { id } = Route.useParams();
  const [exportOpen, setExportOpen] = useState(false);
  const fn = useServerFn(getScanDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["scan", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: (q) => {
      const status = (q.state.data as { scan: { status: string } } | undefined)?.scan.status;
      return status && ["queued", "running", "crawling", "analyzing"].includes(status) ? 4000 : false;
    },
  });

  if (isLoading || !data) {
    return (
      <main className="mx-auto flex max-w-6xl items-center justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  const { scan, pages, issues } = data;
  const scores = (scan.scores ?? {}) as Record<string, number>;
  const ai = scan.ai_report as AIReport | null;

  const running = scan.status === "crawling" || scan.status === "analyzing";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Voltar
      </Link>

      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{scan.host}</h1>
            <a href={scan.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
              {scan.url} <ExternalLink className="h-3 w-3" />
            </a>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={scan.status} />
              <span className="text-muted-foreground">{scan.pages_crawled} páginas · iniciado {new Date(scan.started_at).toLocaleString("pt-BR")}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/compare" search={{ b: scan.id, host: scan.host }}>
              <Button variant="secondary" disabled={scan.status !== "completed"}>
                <GitCompare className="mr-2 h-4 w-4" />
                Comparar Análises
              </Button>
            </Link>
            <Button
              onClick={() => setExportOpen(true)}
              disabled={scan.status !== "completed"}
              title={scan.status !== "completed" ? "Relatório disponível após a conclusão da análise" : "Exportar Relatório"}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar Relatório
            </Button>
          </div>
        </div>

        <ExportModal
          open={exportOpen}
          onOpenChange={setExportOpen}
          scanId={scan.id}
          host={scan.host}
          scanCompleted={scan.status === "completed"}
        />

        {scan.status === "failed" && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>Falha ao analisar: {scan.error_message || "erro desconhecido"}</div>
          </div>
        )}

        {running && (
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {scan.status === "crawling" ? "Rastreando páginas do site…" : "IA analisando resultados…"}
          </div>
        )}

        {scan.pages_crawled > 0 && (
          <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            <ScoreRing value={scores.overall ?? 0} label="Geral" />
            <ScoreRing value={scores.seo ?? 0} label="SEO" size={80} />
            <ScoreRing value={scores.performance ?? 0} label="Perf." size={80} />
            <ScoreRing value={scores.content ?? 0} label="Conteúdo" size={80} />
            <ScoreRing value={scores.indexation ?? 0} label="Indexação" size={80} />
            <ScoreRing value={scores.mobile ?? 0} label="Mobile" size={80} />
            <ScoreRing value={scores.accessibility ?? 0} label="Acess." size={80} />
            <ScoreRing value={scores.security ?? 0} label="Segurança" size={80} />
          </div>
        )}
      </div>

      {scan.pages_crawled > 0 && (
        <Tabs defaultValue="ai" className="mt-8">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="ai">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Parecer IA
            </TabsTrigger>
            <TabsTrigger value="issues">Problemas ({issues.length})</TabsTrigger>
            <TabsTrigger value="pages">Páginas ({pages.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="mt-6">
            {!ai ? (
              <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
                Parecer da IA será exibido aqui assim que a análise for concluída.
              </div>
            ) : (
              <div className="space-y-6">
                <Section title="Resumo executivo">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {ai.executive_summary}
                  </p>
                </Section>

                {ai.top_issues && (
                  <Section title="10 problemas mais críticos">
                    <ol className="space-y-3">
                      {ai.top_issues.map((it, idx) => (
                        <li key={idx} className="rounded-lg border border-border/60 bg-card/40 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-medium">
                              {idx + 1}. {it.title}
                            </div>
                            <SeverityBadge severity={it.severity} />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            <strong className="text-foreground">Por que importa: </strong>{it.why_it_matters}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <strong className="text-foreground">Como corrigir: </strong>{it.how_to_fix}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}

                {ai.quick_wins && ai.quick_wins.length > 0 && (
                  <Section title="Quick wins">
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {ai.quick_wins.map((q, i) => (
                        <li key={i} className="flex gap-2 rounded-lg border border-border/50 bg-card/40 p-3 text-sm">
                          <span className="text-primary">⚡</span> {q}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {ai.roadmap && (
                  <Section title="Plano de ação">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {ai.roadmap.map((w, i) => (
                        <div key={i} className="rounded-lg border border-border/60 bg-card/40 p-4">
                          <div className="text-xs uppercase tracking-wide text-primary">{w.week}</div>
                          <ul className="mt-2 space-y-1.5 text-sm">
                            {w.tasks.map((t, j) => (
                              <li key={j} className="flex gap-2">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" /> {t}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="issues" className="mt-6">
            <div className="space-y-2">
              {issues.map((i) => (
                <div key={i.id} className="glass-card rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={i.severity} />
                        <span className="text-xs text-muted-foreground">{i.category}</span>
                      </div>
                      <div className="mt-1 font-medium">{i.title}</div>
                      {i.recommendation && (
                        <div className="mt-1 text-sm text-muted-foreground">💡 {i.recommendation}</div>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {i.impact && <div>Impacto: {i.impact}</div>}
                      {i.effort && <div>Esforço: {i.effort}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="pages" className="mt-6">
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-card/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">URL</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Tempo</th>
                    <th className="p-3">Palavras</th>
                    <th className="p-3">Título</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.id} className="border-t border-border/40 hover:bg-card/40">
                      <td className="max-w-xs truncate p-3">
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {p.url}
                        </a>
                      </td>
                      <td className="p-3 text-center">
                        <span className={p.status_code && p.status_code >= 400 ? "text-destructive" : ""}>
                          {p.status_code ?? "—"}
                        </span>
                      </td>
                      <td className="p-3 text-center">{p.response_ms}ms</td>
                      <td className="p-3 text-center">{p.word_count}</td>
                      <td className="max-w-sm truncate p-3 text-muted-foreground">{p.title ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-[oklch(0.75_0.16_155)]/15 text-[oklch(0.75_0.16_155)]",
    failed: "bg-destructive/15 text-destructive",
    crawling: "bg-primary/15 text-primary",
    analyzing: "bg-primary/15 text-primary",
    queued: "bg-muted text-muted-foreground",
  };
  return <Badge className={map[status] ?? map.queued}>{status}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const isHigh = s === "high" || s === "alta";
  const isMed = s === "medium" || s === "média" || s === "media";
  const cls = isHigh
    ? "bg-destructive/15 text-destructive"
    : isMed
      ? "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]"
      : "bg-[oklch(0.75_0.16_155)]/15 text-[oklch(0.75_0.16_155)]";
  const label = isHigh ? "Alta" : isMed ? "Média" : "Baixa";
  return <Badge className={cls}>{label}</Badge>;
}
