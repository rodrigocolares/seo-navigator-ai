import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getScanProgress, cancelScan } from "@/lib/scan-queue.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, XCircle, Activity } from "lucide-react";
import { toast } from "sonner";

import { isActiveStatus } from "@/lib/scan-status";

function formatEta(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function ScanProgressPanel({ scanId }: { scanId: string }) {
  const qc = useQueryClient();
  const progressFn = useServerFn(getScanProgress);
  const cancelFn = useServerFn(cancelScan);

  const { data } = useQuery({
    queryKey: ["scan-progress", scanId],
    queryFn: () => progressFn({ data: { id: scanId } }),
    refetchInterval: (q) => {
      const s = (q.state.data as { status?: string; isFinal?: boolean } | undefined);
      if (!s || s.isFinal) return false;
      return isActiveStatus(s.status) ? 3500 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelFn({ data: { id: scanId } }),
    onSuccess: () => {
      toast.success("Análise cancelada.");
      qc.invalidateQueries({ queryKey: ["scan", scanId] });
      qc.invalidateQueries({ queryKey: ["scan-progress", scanId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return null;
  const active = isActiveStatus(data.status);
  if (!active) return null;

  const progress = data.progress ?? 0;
  const discovered = data.pages_discovered ?? 0;
  const processed = data.pages_processed ?? 0;
  const failed = data.pages_failed ?? 0;


  const queuedTooLong =
    data.status === "queued" &&
    data.started_at &&
    Date.now() - new Date(data.started_at).getTime() > 60_000;

  let label = "Rastreando";
  let hint = data.current_url ?? "Preparando rastreamento…";
  if (data.status === "queued") {
    label = "Na fila";
    hint = queuedTooLong
      ? "A análise está demorando para iniciar. O worker pode estar ocupado ou aguardando o próximo ciclo do cron."
      : "Análise na fila. Aguardando o worker iniciar…";
  } else if (data.status === "analyzing") {
    label = "IA analisando";
    hint = "Gerando parecer da IA…";
  } else if (data.status === "running") {
    if (progress < 10) hint = "Descobrindo URLs do site…";
    else if (progress < 85) hint = data.current_url ?? "Analisando páginas…";
    else if (progress < 92) hint = "Calculando scores…";
    else hint = "Gerando parecer da IA…";
  }

  return (
    <div className="glass-card mt-6 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {data.status === "queued" ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Activity className="h-4 w-4 text-primary" />
          )}
          <div>
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate()}
        >
          <XCircle className="mr-1 h-4 w-4" />
          Cancelar análise
        </Button>
      </div>

      <div className="mt-4">
        <Progress value={progress} />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{progress}%</span>
          <span>Tempo estimado: {formatEta(data.eta)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
        <Stat label="Descobertas" value={discovered} />
        <Stat label="Analisadas" value={processed} />
        <Stat label="Falhas" value={failed} tone={failed > 0 ? "warn" : undefined} />
        <Stat label="Jobs" value={data.jobs_pending ?? 0} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-2">
      <div className={`text-lg font-bold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
