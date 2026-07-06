import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyScans } from "@/lib/seo-scan.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const fn = useServerFn(listMyScans);
  const { data, isLoading } = useQuery({ queryKey: ["scans"], queryFn: () => fn() });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Histórico de análises</h1>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : !data?.length ? (
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
              {data.map((s) => {
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
                    <td className="p-3 text-center font-semibold">{scores?.overall ?? "—"}</td>
                    <td className="p-3 text-center capitalize">{s.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
