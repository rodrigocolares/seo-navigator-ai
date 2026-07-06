import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CompareInput = z.object({
  scanIdA: z.string().uuid(), // previous
  scanIdB: z.string().uuid(), // current
  includeAi: z.boolean().optional().default(true),
});

const ListInput = z.object({
  host: z.string().optional(),
  periodDays: z.number().int().positive().max(3650).optional(),
});

export const listComparableScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ListInput.parse(v))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("scans")
      .select("id, url, host, status, pages_crawled, scores, started_at, finished_at, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.host) q = q.eq("host", data.host);
    if (data.periodDays) {
      const since = new Date(Date.now() - data.periodDays * 86400_000).toISOString();
      q = q.gte("created_at", since);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Compute per-host evolution: latest vs previous
    const byHost = new Map<string, typeof rows>();
    (rows ?? []).forEach((r) => {
      const arr = byHost.get(r.host) ?? [];
      arr.push(r); byHost.set(r.host, arr);
    });
    const evolution = [...byHost.entries()].map(([host, list]) => {
      const latest = list[0];
      const previous = list[1] ?? null;
      const lScore = ((latest.scores as { overall?: number } | null)?.overall ?? 0);
      const pScore = previous ? ((previous.scores as { overall?: number } | null)?.overall ?? 0) : null;
      return {
        host,
        latestId: latest.id,
        latestScore: Math.round(lScore),
        latestDate: latest.created_at,
        previousId: previous?.id ?? null,
        previousScore: pScore != null ? Math.round(pScore) : null,
        delta: pScore != null ? Math.round(lScore - pScore) : null,
        totalScans: list.length,
      };
    }).sort((a, b) => a.host.localeCompare(b.host));

    return { scans: rows ?? [], evolution };
  });

export const compareScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CompareInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: scans, error } = await supabase
      .from("scans")
      .select("*")
      .in("id", [data.scanIdA, data.scanIdB]);
    if (error) throw new Error(error.message);
    if (!scans || scans.length !== 2) throw new Error("Análises não encontradas.");
    if (scans.some((s) => s.user_id !== userId)) throw new Error("Sem permissão para comparar essas análises.");
    if (scans.some((s) => s.status !== "completed")) throw new Error("Aguarde a conclusão de ambas as análises.");

    const a = scans.find((s) => s.id === data.scanIdA)!;
    const b = scans.find((s) => s.id === data.scanIdB)!;

    const [pagesA, pagesB, issuesA, issuesB] = await Promise.all([
      supabase.from("scan_pages").select("id, url, status_code, response_ms, title, meta_description").eq("scan_id", a.id),
      supabase.from("scan_pages").select("id, url, status_code, response_ms, title, meta_description").eq("scan_id", b.id),
      supabase.from("scan_issues").select("*").eq("scan_id", a.id),
      supabase.from("scan_issues").select("*").eq("scan_id", b.id),
    ]);

    const mod = await import("./compare.server");
    const partial = mod.buildComparison(
      {
        scan: a as unknown as import("./compare.server").RawScan,
        pages: pagesA.data ?? [],
        issues: (issuesA.data ?? []) as unknown as Parameters<typeof mod.buildComparison>[0]["issues"],
      },
      {
        scan: b as unknown as import("./compare.server").RawScan,
        pages: pagesB.data ?? [],
        issues: (issuesB.data ?? []) as unknown as Parameters<typeof mod.buildComparison>[1]["issues"],
      },
    );

    const ai = data.includeAi ? await mod.generateEvolutionReport(partial) : null;
    return { ...partial, aiEvolutionReport: ai };
  });
