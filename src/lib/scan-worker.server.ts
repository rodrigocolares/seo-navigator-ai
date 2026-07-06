// Server-only worker that processes jobs from the scan_jobs queue.
// Uses supabaseAdmin (service role) — bypasses RLS. Only reachable from the
// authenticated worker route (`/api/public/hooks/process-scan`) or from
// trusted server functions.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchPage,
  analyzeHtml,
  normalizeUrl,
  shouldSkip,
  computeScores,
  generateAIReport,
  type PageAnalysis,
  type CrawlResult,
  type RawIssue,
} from "./seo-analyzer.server";

type JobRow = {
  id: string;
  scan_id: string;
  user_id: string;
  job_type: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
};

const RETRY_BACKOFF_SECONDS = [30, 120, 300];

async function log(
  scan_id: string,
  job_id: string | null,
  level: "info" | "warn" | "error",
  message: string,
  context?: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from("scan_job_logs").insert({
      scan_id,
      job_id,
      level,
      message,
      context: (context ?? null) as never,
    });
  } catch {
    /* logging must never crash */
  }
}

async function enqueue(
  scan_id: string,
  user_id: string,
  job_type: string,
  payload: Record<string, unknown> = {},
  priority = 100,
  run_after_seconds = 0,
) {
  const run_after = new Date(Date.now() + run_after_seconds * 1000).toISOString();
  await supabaseAdmin.from("scan_jobs").insert({
    scan_id,
    user_id,
    job_type,
    payload,
    priority,
    run_after,
  });
}

async function completeJob(job_id: string) {
  await supabaseAdmin
    .from("scan_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job_id);
}

async function failOrRetryJob(job: JobRow, error: string) {
  const attempts = job.attempts;
  if (attempts < job.max_attempts) {
    const delay = RETRY_BACKOFF_SECONDS[Math.min(attempts - 1, RETRY_BACKOFF_SECONDS.length - 1)] ?? 300;
    await supabaseAdmin
      .from("scan_jobs")
      .update({
        status: "retrying",
        error_message: error,
        run_after: new Date(Date.now() + delay * 1000).toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await log(job.scan_id, job.id, "warn", `Job retry em ${delay}s`, { error });
  } else {
    await supabaseAdmin
      .from("scan_jobs")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: error,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await log(job.scan_id, job.id, "error", `Job falhou definitivamente`, { error });
    // If a critical job fails hard, fail the whole scan
    if (job.job_type !== "crawl_page") {
      await supabaseAdmin
        .from("scans")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: error,
        })
        .eq("id", job.scan_id);
    }
  }
}

// ---- Job handlers ----

async function isScanCancelled(scan_id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("scans")
    .select("status")
    .eq("id", scan_id)
    .single();
  return data?.status === "cancelled";
}

async function handleDiscoverUrls(job: JobRow) {
  const { data: scan } = await supabaseAdmin
    .from("scans")
    .select("id, user_id, url, host, max_pages, status")
    .eq("id", job.scan_id)
    .single();
  if (!scan) throw new Error("Scan não encontrado");
  if (scan.status === "cancelled") return;

  const limit = scan.max_pages ?? 15;
  const start = new URL(scan.url);

  await supabaseAdmin
    .from("scans")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      current_url: scan.url,
    })
    .eq("id", scan.id);

  // Robots + sitemap
  const [robotsRes, sitemapRes] = await Promise.all([
    fetchPage(`${start.origin}/robots.txt`, 6000),
    fetchPage(`${start.origin}/sitemap.xml`, 6000),
  ]);
  const robotsFound = !!robotsRes && robotsRes.status === 200;
  const sitemapFound = !!sitemapRes && sitemapRes.status === 200;

  // Collect candidate URLs
  const urls = new Set<string>();
  urls.add(normalizeUrl(scan.url));

  if (sitemapRes?.html) {
    const locs = Array.from(sitemapRes.html.matchAll(/<loc>([^<]+)<\/loc>/gi))
      .map((m) => m[1].trim())
      .filter((u) => {
        try {
          return new URL(u).hostname === scan.host;
        } catch {
          return false;
        }
      });
    for (const u of locs) {
      if (urls.size >= limit) break;
      const n = normalizeUrl(u);
      if (!shouldSkip(n)) urls.add(n);
    }
  }

  // If still under limit, discover a few links from the home page
  if (urls.size < limit) {
    const home = await fetchPage(scan.url, 10000);
    if (home?.html) {
      const analysis = analyzeHtml(home, scan.host);
      for (const link of analysis.links) {
        if (urls.size >= limit) break;
        const n = normalizeUrl(link);
        if (!shouldSkip(n)) urls.add(n);
      }
    }
  }

  const list = Array.from(urls).slice(0, limit);

  // Persist site-level issues right away
  const siteIssues: RawIssue[] = [];
  if (!robotsFound)
    siteIssues.push({
      category: "Indexação",
      severity: "medium",
      title: "robots.txt não encontrado",
      recommendation: "Publique /robots.txt (mesmo que permitindo tudo).",
      impact: "médio",
      effort: "Fácil",
    });
  if (!sitemapFound)
    siteIssues.push({
      category: "Indexação",
      severity: "high",
      title: "sitemap.xml não encontrado",
      recommendation: "Gere e publique /sitemap.xml.",
      impact: "alto",
      effort: "Média",
    });
  if (siteIssues.length > 0) {
    await supabaseAdmin.from("scan_issues").insert(
      siteIssues.map((i) => ({
        scan_id: scan.id,
        page_id: null,
        category: i.category,
        severity: i.severity,
        title: i.title,
        description: i.description ?? null,
        recommendation: i.recommendation ?? null,
        impact: i.impact ?? null,
        effort: i.effort ?? null,
      })),
    );
  }

  await supabaseAdmin
    .from("scans")
    .update({ pages_discovered: list.length })
    .eq("id", scan.id);

  await log(scan.id, job.id, "info", `URLs descobertas: ${list.length}`, {
    robots: robotsFound,
    sitemap: sitemapFound,
  });

  // Enqueue one crawl_page per URL
  for (const url of list) {
    await enqueue(scan.id, scan.user_id, "crawl_page", { url }, 90);
  }
  // finalize sentinel (calculate_scores) will be enqueued when last crawl finishes
}

async function handleCrawlPage(job: JobRow) {
  if (await isScanCancelled(job.scan_id)) return;

  const url = String((job.payload ?? {}).url ?? "");
  if (!url) throw new Error("payload.url ausente");

  const { data: scan } = await supabaseAdmin
    .from("scans")
    .select("id, user_id, host, pages_discovered, pages_processed, pages_failed")
    .eq("id", job.scan_id)
    .single();
  if (!scan) throw new Error("Scan não encontrado");

  await supabaseAdmin
    .from("scans")
    .update({ current_url: url })
    .eq("id", scan.id);

  const fetched = await fetchPage(url);
  let ok = false;
  let analysis: PageAnalysis | null = null;
  if (fetched) {
    try {
      analysis = analyzeHtml(fetched, scan.host);
      ok = true;
    } catch (err) {
      await log(scan.id, job.id, "warn", `Falha ao analisar ${url}`, { error: String(err) });
    }
  } else {
    await log(scan.id, job.id, "warn", `Falha ao buscar ${url}`);
  }

  if (ok && analysis) {
    const { data: inserted } = await supabaseAdmin
      .from("scan_pages")
      .insert({
        scan_id: scan.id,
        url: analysis.url,
        status_code: analysis.status,
        response_ms: analysis.responseMs,
        size_bytes: analysis.bytes,
        content_type: analysis.contentType,
        title: analysis.title,
        meta_description: analysis.metaDescription,
        canonical: analysis.canonical,
        robots_meta: analysis.robotsMeta,
        lang: analysis.lang,
        viewport: analysis.viewport,
        h1_count: analysis.h1Count,
        h2_count: analysis.h2Count,
        word_count: analysis.wordCount,
        images_total: analysis.imagesTotal,
        images_missing_alt: analysis.imagesMissingAlt,
        links_internal: analysis.linksInternal,
        links_external: analysis.linksExternal,
        has_og: analysis.hasOg,
        has_schema: analysis.hasSchema,
        is_https: analysis.isHttps,
        data: { headings: analysis.headings } as never,
      })
      .select("id")
      .single();

    if (inserted && analysis.issues.length > 0) {
      await supabaseAdmin.from("scan_issues").insert(
        analysis.issues.map((i) => ({
          scan_id: scan.id,
          page_id: inserted.id,
          category: i.category,
          severity: i.severity,
          title: i.title,
          description: i.description ?? null,
          recommendation: i.recommendation ?? null,
          impact: i.impact ?? null,
          effort: i.effort ?? null,
        })),
      );
    }
  }

  // Recompute counters atomically-ish via read+update; race-safe enough with SKIP LOCKED single-worker execution
  const processed = (scan.pages_processed ?? 0) + (ok ? 1 : 0);
  const failed = (scan.pages_failed ?? 0) + (ok ? 0 : 1);
  const discovered = scan.pages_discovered ?? 1;
  const progress = Math.min(99, Math.round(((processed + failed) / Math.max(1, discovered)) * 100));

  await supabaseAdmin
    .from("scans")
    .update({
      pages_processed: processed,
      pages_failed: failed,
      pages_crawled: processed,
      progress,
    })
    .eq("id", scan.id);

  // If we are the last page, enqueue scoring
  if (processed + failed >= discovered) {
    await enqueue(scan.id, scan.user_id, "calculate_scores", {}, 80);
  }
}

async function handleCalculateScores(job: JobRow) {
  if (await isScanCancelled(job.scan_id)) return;

  const [{ data: pages }, { data: issues }] = await Promise.all([
    supabaseAdmin.from("scan_pages").select("*").eq("scan_id", job.scan_id),
    supabaseAdmin.from("scan_issues").select("*").eq("scan_id", job.scan_id),
  ]);

  // Rebuild a minimal CrawlResult shape for computeScores
  const pageAnalyses = (pages ?? []).map((p) => ({
    issues: (issues ?? [])
      .filter((i) => i.page_id === p.id)
      .map((i) => ({
        category: i.category,
        severity: i.severity as RawIssue["severity"],
        title: i.title,
      })),
  }));
  const siteIssues = (issues ?? [])
    .filter((i) => i.page_id === null)
    .map((i) => ({
      category: i.category,
      severity: i.severity as RawIssue["severity"],
      title: i.title,
    }));
  const crawl = { pages: pageAnalyses, siteIssues, robotsTxtFound: true, sitemapFound: true } as unknown as CrawlResult;
  const scores = computeScores(crawl);

  await supabaseAdmin
    .from("scans")
    .update({ scores: scores as unknown as never, status: "analyzing" })
    .eq("id", job.scan_id);

  const { data: scan } = await supabaseAdmin
    .from("scans")
    .select("user_id")
    .eq("id", job.scan_id)
    .single();

  await enqueue(job.scan_id, scan!.user_id, "generate_ai_report", {}, 70);
}

async function handleGenerateAIReport(job: JobRow) {
  if (await isScanCancelled(job.scan_id)) return;

  const { data: scan } = await supabaseAdmin
    .from("scans")
    .select("id, user_id, url, scores")
    .eq("id", job.scan_id)
    .single();
  if (!scan) throw new Error("Scan não encontrado");

  const [{ data: pages }, { data: issues }] = await Promise.all([
    supabaseAdmin.from("scan_pages").select("*").eq("scan_id", job.scan_id),
    supabaseAdmin.from("scan_issues").select("*").eq("scan_id", job.scan_id),
  ]);

  const crawl = {
    robotsTxtFound: true,
    sitemapFound: true,
    siteIssues: (issues ?? [])
      .filter((i) => i.page_id === null)
      .map((i) => ({
        category: i.category,
        severity: i.severity as RawIssue["severity"],
        title: i.title,
        description: i.description ?? undefined,
        recommendation: i.recommendation ?? undefined,
      })),
    pages: (pages ?? []).map((p) => ({
      url: p.url,
      title: p.title,
      status: p.status_code ?? 0,
      responseMs: p.response_ms ?? 0,
      wordCount: p.word_count ?? 0,
      issues: (issues ?? [])
        .filter((i) => i.page_id === p.id)
        .map((i) => ({
          category: i.category,
          severity: i.severity as RawIssue["severity"],
          title: i.title,
          description: i.description ?? undefined,
          recommendation: i.recommendation ?? undefined,
        })),
    })),
  } as unknown as CrawlResult;

  try {
    const report = await generateAIReport(scan.url, scan.scores as never, crawl);
    if (report) {
      await supabaseAdmin
        .from("scans")
        .update({ ai_report: report as unknown as never, ai_error: null })
        .eq("id", scan.id);
    } else {
      await supabaseAdmin
        .from("scans")
        .update({ ai_error: "IA indisponível" })
        .eq("id", scan.id);
    }
  } catch (err) {
    await supabaseAdmin
      .from("scans")
      .update({ ai_error: err instanceof Error ? err.message : "Falha desconhecida na IA" })
      .eq("id", scan.id);
    await log(scan.id, job.id, "warn", "Falha ao gerar parecer IA", { error: String(err) });
  }

  await enqueue(scan.id, scan.user_id, "finalize_scan", {}, 60);
}

async function handleFinalizeScan(job: JobRow) {
  if (await isScanCancelled(job.scan_id)) return;
  await supabaseAdmin
    .from("scans")
    .update({
      status: "completed",
      progress: 100,
      completed_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      current_url: null,
    })
    .eq("id", job.scan_id);
  await log(job.scan_id, job.id, "info", "Scan finalizado");
}

async function runJob(job: JobRow) {
  switch (job.job_type) {
    case "discover_urls":
      return handleDiscoverUrls(job);
    case "crawl_page":
      return handleCrawlPage(job);
    case "calculate_scores":
      return handleCalculateScores(job);
    case "generate_ai_report":
      return handleGenerateAIReport(job);
    case "finalize_scan":
      return handleFinalizeScan(job);
    default:
      throw new Error(`Tipo de job desconhecido: ${job.job_type}`);
  }
}

export interface ProcessResult {
  claimed: number;
  processed: number;
  results: { id: string; type: string; ok: boolean; error?: string }[];
}

const MAX_MS = 45_000;

export async function processQueueBatch(batchSize = 5, workerId = "worker"): Promise<ProcessResult> {
  const { data: jobs, error } = await supabaseAdmin.rpc("claim_scan_jobs", {
    _limit: batchSize,
    _worker: workerId,
  });
  if (error) throw new Error(error.message);
  const claimed = (jobs ?? []) as JobRow[];
  const results: ProcessResult["results"] = [];
  const started = Date.now();

  for (const job of claimed) {
    if (Date.now() - started > MAX_MS) break;
    try {
      await runJob(job);
      await completeJob(job.id);
      results.push({ id: job.id, type: job.job_type, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failOrRetryJob(job, msg);
      results.push({ id: job.id, type: job.job_type, ok: false, error: msg });
    }
  }

  return { claimed: claimed.length, processed: results.length, results };
}
