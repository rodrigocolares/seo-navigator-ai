import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StartScanInput = z.object({
  url: z.string().url(),
  maxPages: z.number().int().min(1).max(50).default(15),
});

export const startScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => StartScanInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const parsed = new URL(data.url);

    const { data: scan, error } = await supabase
      .from("scans")
      .insert({
        user_id: userId,
        url: parsed.toString(),
        host: parsed.hostname,
        max_pages: data.maxPages,
        status: "crawling",
      })
      .select()
      .single();
    if (error || !scan) throw new Error(error?.message || "Falha ao criar análise");

    // Run crawl + analyze + AI report inline (bounded).
    try {
      const { crawlSite, computeScores, generateAIReport } = await import("./seo-analyzer.server");
      const crawl = await crawlSite(parsed.toString(), data.maxPages);
      const scores = computeScores(crawl);

      // Persist pages
      if (crawl.pages.length > 0) {
        const pageRows = crawl.pages.map((p) => ({
          scan_id: scan.id,
          url: p.url,
          status_code: p.status,
          response_ms: p.responseMs,
          size_bytes: p.bytes,
          content_type: p.contentType,
          title: p.title,
          meta_description: p.metaDescription,
          canonical: p.canonical,
          robots_meta: p.robotsMeta,
          lang: p.lang,
          viewport: p.viewport,
          h1_count: p.h1Count,
          h2_count: p.h2Count,
          word_count: p.wordCount,
          images_total: p.imagesTotal,
          images_missing_alt: p.imagesMissingAlt,
          links_internal: p.linksInternal,
          links_external: p.linksExternal,
          has_og: p.hasOg,
          has_schema: p.hasSchema,
          is_https: p.isHttps,
          data: { headings: p.headings },
        }));
        const { data: insertedPages } = await supabase
          .from("scan_pages")
          .insert(pageRows)
          .select("id, url");

        // Persist issues (site-level + per-page)
        const urlToId = new Map((insertedPages ?? []).map((r) => [r.url, r.id]));
        const issueRows = [
          ...crawl.siteIssues.map((i) => ({
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
          ...crawl.pages.flatMap((p) =>
            p.issues.map((i) => ({
              scan_id: scan.id,
              page_id: urlToId.get(p.url) ?? null,
              category: i.category,
              severity: i.severity,
              title: i.title,
              description: i.description ?? null,
              recommendation: i.recommendation ?? null,
              impact: i.impact ?? null,
              effort: i.effort ?? null,
            })),
          ),
        ];
        if (issueRows.length > 0) {
          await supabase.from("scan_issues").insert(issueRows);
        }
      }

      await supabase
        .from("scans")
        .update({ status: "analyzing", pages_crawled: crawl.pages.length, scores: scores as unknown as never })
        .eq("id", scan.id);

      const aiReport = await generateAIReport(parsed.toString(), scores, crawl);

      await supabase
        .from("scans")
        .update({
          status: "completed",
          ai_report: aiReport as unknown as never,
          finished_at: new Date().toISOString(),
        })
        .eq("id", scan.id);

      return { id: scan.id };
    } catch (err) {
      console.error("[startScan] failed", err);
      await supabase
        .from("scans")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Erro desconhecido",
          finished_at: new Date().toISOString(),
        })
        .eq("id", scan.id);
      return { id: scan.id };
    }
  });

export const listMyScans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scans")
      .select("id, url, host, status, pages_crawled, scores, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data;
  });

export const getScanDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: scan }, { data: pages }, { data: issues }] = await Promise.all([
      supabase.from("scans").select("*").eq("id", data.id).single(),
      supabase.from("scan_pages").select("*").eq("scan_id", data.id).order("created_at"),
      supabase.from("scan_issues").select("*").eq("scan_id", data.id).order("severity"),
    ]);
    if (!scan) throw new Error("Análise não encontrada");
    return { scan, pages: pages ?? [], issues: issues ?? [] };
  });
