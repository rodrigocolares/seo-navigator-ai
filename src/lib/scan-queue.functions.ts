import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StartAsyncScanInput = z.object({
  url: z.string().url(),
  maxPages: z.number().int().min(1).max(500).default(15),
});

export const startAsyncScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => StartAsyncScanInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const parsed = new URL(data.url);

    // Concurrency guard: max 2 active scans per user
    const { count } = await supabase
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["queued", "running", "crawling", "analyzing"]);
    if ((count ?? 0) >= 2) {
      throw new Error("Você já tem 2 análises em andamento. Aguarde uma finalizar.");
    }

    const { data: scan, error } = await supabase
      .from("scans")
      .insert({
        user_id: userId,
        url: parsed.toString(),
        host: parsed.hostname,
        max_pages: data.maxPages,
        status: "queued",
        crawler_mode: "async",
      })
      .select()
      .single();
    if (error || !scan) throw new Error(error?.message || "Falha ao criar análise");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("scan_jobs").insert({
      scan_id: scan.id,
      user_id: userId,
      job_type: "discover_urls",
      priority: 100,
    });

    // Best-effort kick to the worker so processing starts immediately.
    try {
      const host = getRequestHost();
      const workerSecret = process.env.WORKER_SECRET;
      // The id-preview--<id>.lovable.app host is behind the Lovable auth
      // bridge, so /api/public/* is not reachable server-to-server there.
      // Rewrite to the stable dev URL project--<id>-dev.lovable.app.
      let target = host;
      const m = host?.match(/^id-preview--([0-9a-f-]+)\.lovable\.app$/i);
      if (m) target = `project--${m[1]}-dev.lovable.app`;
      if (target && workerSecret) {
        void fetch(`https://${target}/api/public/hooks/process-scan`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-worker-secret": workerSecret,
          },
          body: JSON.stringify({ trigger: "start", scan_id: scan.id }),
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }


    return { id: scan.id };
  });

export const getScanProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: scan } = await supabase
      .from("scans")
      .select(
        "id, status, progress, pages_discovered, pages_processed, pages_failed, current_url, estimated_remaining_seconds, ai_error, started_at",
      )
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (!scan) throw new Error("Análise não encontrada");

    const { count: pending } = await supabase
      .from("scan_jobs")
      .select("id", { count: "exact", head: true })
      .eq("scan_id", data.id)
      .in("status", ["queued", "running", "retrying"]);

    // Estimate remaining seconds from average time per processed page
    let eta: number | null = null;
    const processed = scan.pages_processed ?? 0;
    const discovered = scan.pages_discovered ?? 0;
    if (processed > 0 && discovered > processed && scan.started_at) {
      const elapsed = (Date.now() - new Date(scan.started_at).getTime()) / 1000;
      const perPage = elapsed / processed;
      eta = Math.round(perPage * (discovered - processed));
    }

    return { ...scan, jobs_pending: pending ?? 0, eta };
  });

export const cancelScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: scan } = await supabase
      .from("scans")
      .select("id, status")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (!scan) throw new Error("Análise não encontrada");
    if (["completed", "failed", "cancelled"].includes(scan.status ?? "")) {
      return { ok: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("scans")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        error_message: "Análise cancelada pelo usuário.",
      })
      .eq("id", data.id);
    await supabaseAdmin
      .from("scan_jobs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("scan_id", data.id)
      .in("status", ["queued", "retrying"]);
    return { ok: true };
  });
