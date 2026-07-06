import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listComparableScans, compareScans } from "@/lib/compare.functions";
import { Loader2, ArrowLeft, ArrowUp, ArrowDown, Minus, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";

const search = z.object({
  a: z.string().uuid().optional(),
  b: z.string().uuid().optional(),
  host: z.string().optional(),
  period: z.enum(["all", "7", "30", "90"]).optional(),
});

export const Route = createFileRoute("/_authenticated/compare")({
  validateSearch: (v) => search.parse(v),
  component: ComparePage,
});

function ComparePage() {
  const nav = Route.useNavigate();
  const params = Route.useSearch();
  const listFn = useServerFn(listComparableScans);
  const compareFn = useServerFn(compareScans);

  const [period, setPeriod] = useState<"all" | "7" | "30" | "90">(params.period ?? "all");
  const [host, setHost] = useState<string | undefined>(params.host);
  const [a, setA] = useState<string | undefined>(params.a);
  const [b, setB] = useState<string | undefined>(params.b);

  const periodDays = period === "all" ? undefined : Number(period);

  const listQ = useQuery({
    queryKey: ["compare-list", host, periodDays],
    queryFn: () => listFn({ data: { host, periodDays } }),
  });

  const scans = listQ.data?.scans ?? [];
  const evolution = listQ.data?.evolution ?? [];
  const hosts = useMemo(() => [...new Set(scans.map((s) => s.host))], [scans]);
  const filteredScans = useMemo(() => (host ? scans.filter((s) => s.host === host) : scans), [scans, host]);

  // Auto-pick latest two when host chosen & no explicit selection
  useEffect(() => {
    if (host && !a && !b && filteredScans.length >= 2) {
      setB(filteredScans[0].id);
      setA(filteredScans[1].id);
    }
  }, [host, a, b, filteredScans]);

  useEffect(() => {
    nav({ search: { a, b, host, period } as never, replace: true });
  }, [a, b, host, period, nav]);

  const compareQ = useQuery({
    queryKey: ["compare", a, b],
    queryFn: () => compareFn({ data: { scanIdA: a!, scanIdB: b!, includeAi: true } }),
    enabled: !!a && !!b && a !== b,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link to="/history" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Voltar ao histórico
      </Link>

      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Comparação de Análises</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Compare duas auditorias do mesmo domínio para acompanhar a evolução do seu SEO.
      </p>

      {/* Selectors */}
      <div className="glass-card grid gap-4 rounded-2xl p-4 sm:grid-cols-4 sm:p-6">
        <SelectorField label="Domínio">
          <Select value={host ?? "__all"} onValueChange={(v) => { setHost(v === "__all" ? undefined : v); setA(undefined); setB(undefined); }}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os domínios</SelectItem>
              {hosts.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </SelectorField>
        <SelectorField label="Período">
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </SelectorField>
        <SelectorField label="Análise anterior">
          <ScanSelect value={a} onChange={setA} options={filteredScans} exclude={b} />
        </SelectorField>
        <SelectorField label="Análise atual">
          <ScanSelect value={b} onChange={setB} options={filteredScans} exclude={a} />
        </SelectorField>
      </div>

      {/* Evolution summary of hosts */}
      {!host && evolution.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Evolução por domínio</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {evolution.map((e) => (
              <div key={e.host} className="glass-card rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{e.host}</div>
                  <TrendPill delta={e.delta} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{e.totalScans} análise(s)</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{e.latestScore}</span>
                  {e.previousScore != null && <span className="text-xs text-muted-foreground">antes {e.previousScore}</span>}
                </div>
                {e.previousId && (
                  <Button size="sm" variant="secondary" className="mt-3 w-full"
                    onClick={() => { setHost(e.host); setA(e.previousId!); setB(e.latestId); }}>
                    Comparar última vs anterior
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparison result */}
      <div className="mt-8">
        {!a || !b ? (
          <EmptyState msg={filteredScans.length < 2
            ? "Faça uma nova análise deste domínio para acompanhar a evolução."
            : "Selecione a análise anterior e a atual para comparar."} />
        ) : a === b ? (
          <EmptyState msg="Selecione duas análises diferentes." />
        ) : compareQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Calculando comparação e parecer da IA…
          </div>
        ) : compareQ.error ? (
          <ErrorBox message={(compareQ.error as Error).message} />
        ) : compareQ.data ? (
          <ComparisonView data={compareQ.data} />
        ) : null}
      </div>
    </main>
  );
}

function SelectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ScanSelect({
  value, onChange, options, exclude,
}: {
  value?: string; onChange: (v: string) => void;
  options: { id: string; host: string; created_at: string; scores: unknown }[]; exclude?: string;
}) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
      <SelectContent>
        {options.filter((o) => o.id !== exclude).map((o) => {
          const sc = (o.scores as { overall?: number } | null)?.overall ?? 0;
          return (
            <SelectItem key={o.id} value={o.id}>
              {o.host} · {new Date(o.created_at).toLocaleDateString("pt-BR")} · {Math.round(sc)}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="glass-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
      {msg}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
      <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
      <span>{message}</span>
    </div>
  );
}

function TrendPill({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-xs text-muted-foreground">—</span>;
  if (delta > 0) return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-500"><ArrowUp className="h-3 w-3" />+{delta}</span>;
  if (delta < 0) return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive"><ArrowDown className="h-3 w-3" />{delta}</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0</span>;
}

type CompareResult = Awaited<ReturnType<Awaited<ReturnType<typeof useServerFn<typeof compareScans>>>>>;

function ComparisonView({ data }: { data: CompareResult }) {
  const s = data.summary;
  const previousDate = new Date(data.previousScan.finished_at ?? data.previousScan.started_at).toLocaleString("pt-BR");
  const currentDate = new Date(data.currentScan.finished_at ?? data.currentScan.started_at).toLocaleString("pt-BR");
  return (
    <div className="space-y-6">
      {!data.sameHost && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
          Para uma comparação precisa, selecione análises do mesmo domínio.
        </div>
      )}

      {/* Header cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Score geral" value={s.overallCurrent} delta={s.overallDelta} suffix={s.overallPct !== 0 ? ` (${s.overallPct > 0 ? "+" : ""}${s.overallPct}%)` : ""} sub={`antes ${s.overallPrevious}`} />
        <MetricCard title="Total de problemas" value={s.issuesCurrent} delta={-(s.issuesCurrent - s.issuesPrevious)} sub={`antes ${s.issuesPrevious}`} inverted />
        <MetricCard title="Corrigidos" value={s.fixed} sub={`persistentes ${s.persistent}`} accent="emerald" />
        <MetricCard title="Novos problemas" value={s.added} sub={`críticos: ${s.highAfter} (antes ${s.highBefore})`} accent={s.added > 0 ? "destructive" : "muted"} />
      </div>

      <div className="glass-card rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <div>Anterior · {previousDate}</div>
          <div>Atual · {currentDate}</div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Categoria</th>
                <th className="p-2 text-center">Anterior</th>
                <th className="p-2 text-center">Atual</th>
                <th className="p-2 text-center">Variação</th>
                <th className="p-2 text-center">Tendência</th>
              </tr>
            </thead>
            <tbody>
              {data.scoreDelta.map((sd) => (
                <tr key={sd.category} className="border-t border-border/40">
                  <td className="p-2 uppercase">{sd.category}</td>
                  <td className="p-2 text-center">{sd.previous}</td>
                  <td className="p-2 text-center font-semibold">{sd.current}</td>
                  <td className="p-2 text-center"><TrendPill delta={sd.delta} /></td>
                  <td className="p-2 text-center text-xs">
                    {sd.trend === "up" ? "Melhorou" : sd.trend === "down" ? "Piorou" : "Estável"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart for score comparison */}
      <ScoreBars data={data.scoreDelta} />

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="ai"><Sparkles className="mr-1 h-3.5 w-3.5" /> Parecer IA</TabsTrigger>
          <TabsTrigger value="fixed">Corrigidos ({data.fixedIssues.length})</TabsTrigger>
          <TabsTrigger value="new">Novos ({data.newIssues.length})</TabsTrigger>
          <TabsTrigger value="persistent">Persistentes ({data.persistentIssues.length})</TabsTrigger>
          <TabsTrigger value="delta">Mudanças ({data.improvedIssues.length + data.worsenedIssues.length})</TabsTrigger>
          <TabsTrigger value="pages">Páginas ({data.pageChanges.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4">
          {!data.aiEvolutionReport ? (
            <EmptyState msg="Parecer da IA indisponível no momento." />
          ) : (
            <div className="glass-card space-y-4 rounded-2xl p-6">
              <p className="whitespace-pre-line text-sm text-muted-foreground">{data.aiEvolutionReport.summary}</p>
              <AiList title="Principais melhorias" items={data.aiEvolutionReport.improvements} color="emerald" />
              <AiList title="Principais regressões" items={data.aiEvolutionReport.regressions} color="destructive" />
              <AiList title="Riscos atuais" items={data.aiEvolutionReport.risks} color="amber" />
              <div className="grid gap-4 sm:grid-cols-2">
                <AiList title="Próximos 7 dias" items={data.aiEvolutionReport.next7Days} color="primary" />
                <AiList title="Próximos 30 dias" items={data.aiEvolutionReport.next30Days} color="primary" />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="fixed" className="mt-4">
          <IssueList items={data.fixedIssues} statusLabel="Corrigido" statusColor="emerald" empty="Nenhum problema corrigido desde a análise anterior." />
        </TabsContent>
        <TabsContent value="new" className="mt-4">
          <IssueList items={data.newIssues} statusLabel="Novo" statusColor="destructive" empty="Nenhum problema novo encontrado. 🎉" />
        </TabsContent>
        <TabsContent value="persistent" className="mt-4">
          <IssueList items={data.persistentIssues} statusLabel="Persistente" statusColor="amber" empty="Sem problemas persistentes." />
        </TabsContent>

        <TabsContent value="delta" className="mt-4 space-y-4">
          <DeltaTable title="Problemas que pioraram" rows={data.worsenedIssues} accent="destructive" empty="Nenhum problema piorou." />
          <DeltaTable title="Problemas que melhoraram" rows={data.improvedIssues} accent="emerald" empty="Nenhum problema melhorou." />
        </TabsContent>

        <TabsContent value="pages" className="mt-4">
          <PageChangesTable rows={data.pageChanges} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  title, value, delta, suffix = "", sub, accent, inverted,
}: {
  title: string; value: number | string; delta?: number; suffix?: string;
  sub?: string; accent?: "emerald" | "destructive" | "muted"; inverted?: boolean;
}) {
  const color = accent === "emerald" ? "text-emerald-500"
    : accent === "destructive" ? "text-destructive"
    : accent === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className={`mt-1 flex items-baseline gap-2 text-3xl font-bold ${color}`}>
        {value}
        {delta != null && <TrendPill delta={inverted ? delta : delta} />}
      </div>
      {suffix && <div className="text-xs text-muted-foreground">{suffix}</div>}
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ScoreBars({ data }: { data: CompareResult["scoreDelta"] }) {
  const max = 100;
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-3 text-sm font-semibold">Comparação por categoria</div>
      <div className="space-y-3">
        {data.map((s) => (
          <div key={s.category}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="uppercase">{s.category}</span>
              <TrendPill delta={s.delta} />
            </div>
            <div className="relative h-4 overflow-hidden rounded-full bg-muted/40">
              <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/40"
                style={{ width: `${(s.previous / max) * 100}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
                style={{ width: `${(s.current / max) * 100}%`, opacity: 0.85 }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
              <span>antes {s.previous}</span>
              <span>atual {s.current}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiList({ title, items, color }: { title: string; items: string[]; color: "emerald" | "destructive" | "amber" | "primary" }) {
  if (!items?.length) return null;
  const cls = color === "emerald" ? "text-emerald-500"
    : color === "destructive" ? "text-destructive"
    : color === "amber" ? "text-amber-500" : "text-primary";
  return (
    <div>
      <div className={`mb-1 text-xs font-semibold uppercase ${cls}`}>{title}</div>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => <li key={i} className="flex gap-2"><span className={cls}>•</span>{it}</li>)}
      </ul>
    </div>
  );
}

function IssueList({ items, statusLabel, statusColor, empty }: {
  items: CompareResult["fixedIssues"]; statusLabel: string;
  statusColor: "emerald" | "destructive" | "amber"; empty: string;
}) {
  if (!items.length) return <EmptyState msg={empty} />;
  const badge = statusColor === "emerald"
    ? "bg-emerald-500/15 text-emerald-500"
    : statusColor === "destructive"
      ? "bg-destructive/15 text-destructive"
      : "bg-amber-500/15 text-amber-500";
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.key} className="glass-card rounded-lg p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className={badge}>{statusLabel}</Badge>
                <span className="text-muted-foreground">{i.category}</span>
                <span className="text-muted-foreground">{i.severityLabel}</span>
              </div>
              <div className="mt-1 truncate font-medium">{i.title}</div>
              <div className="truncate text-xs text-muted-foreground">{i.url}</div>
              {i.recommendation && <div className="mt-1 text-xs text-muted-foreground">💡 {i.recommendation}</div>}
            </div>
            {statusLabel === "Corrigido" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function DeltaTable({ title, rows, accent, empty }: {
  title: string; rows: CompareResult["improvedIssues"]; accent: "emerald" | "destructive"; empty: string;
}) {
  const cls = accent === "emerald" ? "text-emerald-500" : "text-destructive";
  return (
    <div className="glass-card rounded-2xl p-4">
      <h3 className={`mb-2 text-sm font-semibold ${cls}`}>{title}</h3>
      {!rows.length ? <div className="text-sm text-muted-foreground">{empty}</div> : (
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Problema</th>
                <th className="p-2">Categoria</th>
                <th className="p-2">Antes</th>
                <th className="p-2">Depois</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/40">
                  <td className="p-2">{r.title}</td>
                  <td className="p-2 text-center text-xs">{r.category}</td>
                  <td className="p-2 text-center text-xs">{r.before}</td>
                  <td className="p-2 text-center text-xs">{r.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PageChangesTable({ rows }: { rows: CompareResult["pageChanges"] }) {
  if (!rows.length) return <EmptyState msg="Nenhuma mudança de páginas detectada." />;
  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-card/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left">URL</th>
            <th className="p-2">Antes</th>
            <th className="p-2">Depois</th>
            <th className="p-2 text-left">Mudança</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/40">
              <td className="max-w-xs truncate p-2 text-primary">{r.url}</td>
              <td className="p-2 text-center text-xs text-muted-foreground">
                {r.previous ? `${r.previous.status ?? "—"} · ${r.previous.responseMs ?? "—"}ms` : "—"}
              </td>
              <td className="p-2 text-center text-xs">
                {r.current ? `${r.current.status ?? "—"} · ${r.current.responseMs ?? "—"}ms` : "—"}
              </td>
              <td className="p-2 text-xs">{r.change}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
