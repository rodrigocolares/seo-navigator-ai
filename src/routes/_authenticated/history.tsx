import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listComparableScans } from "@/lib/compare.functions";
import { Button } from "@/components/ui/button";
import { Loader2, GitCompare, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { statusLabel } from "@/lib/scan-status";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const fn = useServerFn(listComparableScans);
  const { data, isLoading } = useQuery({
    queryKey: ["history-with-evolution"],
    queryFn: () => fn({ data: {} }),
  });

  const evolution = data?.evolution ?? [];
  const scans = data?.scans ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Histórico de análises</h1>
        <Link to="/compare" search={{}}>
          <Button variant="secondary"><GitCompare className="mr-2 h-4 w-4" /> Comparar Análises</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {evolution.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Evolução por domínio</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {evolution.map((e) => (
                  <div key={e.host} className="glass-card rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{e.host}</div>
                      <DeltaBadge delta={e.delta} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{e.totalScans} análise(s)</div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-bold">{e.latestScore}</span>
                      {e.previousScore != null && <span className="text-xs text-muted-foreground">antes {e.previousScore}</span>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link to="/scans/$id" params={{ id: e.latestId }} className="flex-1">
                        <Button size="sm" variant="ghost" className="w-full">Ver análise</Button>
                      </Link>
                      {e.previousId && (
                        <Link to="/compare" search={{ a: e.previousId, b: e.latestId, host: e.host }} className="flex-1">
                          <Button size="sm" className="w-full">Comparar</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Todas as análises</h2>
            {!scans.length ? (
              <p className="text-sm text-muted-foreground">Você ainda não fez nenhuma análise.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-card/60 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3 text-left">Site</th>
                      <th className="p-3">Data</th>
                      <th className="p-3">Páginas</th>
                      <th className="p-3">Score</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((s) => {
                      const scores = s.scores as { overall?: number } | null;
                      return (
                        <tr key={s.id} className="border-t border-border/40 hover:bg-card/40">
                          <td className="p-3">
                            <Link to="/scans/$id" params={{ id: s.id }} className="font-medium hover:text-primary">
                              {s.host}
                            </Link>
                          </td>
                          <td className="p-3 text-center text-muted-foreground">{new Date(s.created_at).toLocaleString("pt-BR")}</td>
                          <td className="p-3 text-center">{s.pages_crawled}</td>
                          <td className="p-3 text-center font-semibold">{scores?.overall ? Math.round(scores.overall) : "—"}</td>
                          <td className="p-3 text-center">{statusLabel(s.status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-xs text-muted-foreground">Sem histórico</span>;
  if (delta > 0) return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-500"><ArrowUp className="h-3 w-3" />+{delta}</span>;
  if (delta < 0) return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive"><ArrowDown className="h-3 w-3" />{delta}</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0</span>;
}
