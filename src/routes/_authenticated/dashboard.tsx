import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyScans, startScan } from "@/lib/seo-scan.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Radar, ArrowRight, Clock, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyScans);
  const startFn = useServerFn(startScan);

  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState("15");

  const { data: scans, isLoading } = useQuery({
    queryKey: ["scans"],
    queryFn: () => listFn(),
    refetchInterval: (q) =>
      (q.state.data as { status: string }[] | undefined)?.some((s) => s.status === "crawling" || s.status === "analyzing")
        ? 4000
        : false,
  });

  const mutation = useMutation({
    mutationFn: async (input: { url: string; maxPages: number }) => startFn({ data: input }),
    onSuccess: (res) => {
      toast.success("Análise iniciada");
      qc.invalidateQueries({ queryKey: ["scans"] });
      navigate({ to: "/scans/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    const pending = sessionStorage.getItem("pendingScanUrl");
    if (pending) {
      setUrl(pending);
      sessionStorage.removeItem("pendingScanUrl");
    }
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Nova análise</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole a URL do site e escolha até quantas páginas percorrer.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) return;
            mutation.mutate({ url: url.trim(), maxPages: parseInt(maxPages, 10) });
          }}
          className="mt-6 flex flex-col gap-3 sm:flex-row"
        >
          <Input
            type="url"
            placeholder="https://empresa.com.br"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-12 flex-1 rounded-xl bg-card/60 text-base"
            required
          />
          <Select value={maxPages} onValueChange={setMaxPages}>
            <SelectTrigger className="h-12 w-full rounded-xl sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 páginas</SelectItem>
              <SelectItem value="15">15 páginas</SelectItem>
              <SelectItem value="30">30 páginas</SelectItem>
              <SelectItem value="50">50 páginas</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            size="lg"
            className="h-12 rounded-xl px-6"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Radar className="mr-2 h-4 w-4" />
            )}
            Analisar
          </Button>
        </form>
        {mutation.isPending && (
          <p className="mt-3 text-xs text-muted-foreground">
            Isto pode levar até um minuto. Não feche a página.
          </p>
        )}
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Análises recentes</h2>
        {isLoading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-card/60" />
            ))}
          </div>
        ) : !scans?.length ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
            Nenhuma análise ainda. Faça sua primeira acima.
          </div>
        ) : (
          <div className="grid gap-3">
            {scans.map((s) => (
              <ScanRow
                key={s.id}
                scan={{ ...s, scores: (s.scores as { overall?: number } | null) }}
                onOpen={() => navigate({ to: "/scans/$id", params: { id: s.id } })}
              />

            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function ScanRow({
  scan,
  onOpen,
}: {
  scan: {
    id: string;
    url: string;
    host: string;
    status: string;
    pages_crawled: number;
    scores: { overall?: number } | null;
    created_at: string;
  };
  onOpen: () => void;
}) {
  const statusIcon =
    scan.status === "completed" ? (
      <CheckCircle2 className="h-4 w-4 text-[oklch(0.75_0.16_155)]" />
    ) : scan.status === "failed" ? (
      <XCircle className="h-4 w-4 text-destructive" />
    ) : (
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
    );
  const overall = scan.scores?.overall ?? null;
  return (
    <button
      onClick={onOpen}
      className="glass-card flex w-full items-center gap-4 rounded-xl p-4 text-left transition hover:border-primary/50"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Radar className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{scan.host}</div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          {statusIcon}
          <span className="capitalize">{scan.status}</span>
          <span>·</span>
          <span>{scan.pages_crawled} páginas</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {new Date(scan.created_at).toLocaleString("pt-BR")}
          </span>
        </div>
      </div>
      {overall !== null && (
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Score</div>
          <div className="text-2xl font-bold">{overall}</div>
        </div>
      )}
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
