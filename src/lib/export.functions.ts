import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ExportInput = z.object({
  scanId: z.string().uuid(),
  format: z.enum(["pdf", "xlsx", "csv", "json"]),
  reportType: z.enum(["executive", "technical", "complete"]),
  sections: z.object({
    executiveSummary: z.boolean().optional(),
    scores: z.boolean().optional(),
    diagnosis: z.boolean().optional(),
    topIssues: z.boolean().optional(),
    issuesByCategory: z.boolean().optional(),
    pages: z.boolean().optional(),
    aiReport: z.boolean().optional(),
    roadmap: z.boolean().optional(),
    technicalRecommendations: z.boolean().optional(),
    technicalData: z.boolean().optional(),
    history: z.boolean().optional(),
  }).default({}),
  fileName: z.string().min(1).max(200).optional(),
});

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  json: "application/json",
  zip: "application/zip",
};

export const exportReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ExportInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: scan, error: scanErr } = await supabase
      .from("scans")
      .select("*")
      .eq("id", data.scanId)
      .single();

    if (scanErr || !scan) throw new Error("Análise não encontrada.");
    if (scan.user_id !== userId) throw new Error("Você não tem permissão para exportar esta análise.");
    if (scan.status !== "completed") {
      throw new Error("Relatório disponível após a conclusão da análise.");
    }

    const [{ data: pages }, { data: issues }] = await Promise.all([
      supabase.from("scan_pages").select("*").eq("scan_id", data.scanId).order("created_at"),
      supabase.from("scan_issues").select("*").eq("scan_id", data.scanId),
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    const hostSlug = scan.host.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const baseName = (data.fileName?.trim() || `seo-report-${hostSlug}-${dateStr}`).replace(/\.[a-z0-9]+$/i, "");

    let ext = data.format;
    let mimeType = MIME[data.format];
    let base64 = "";

    try {
      const mod = await import("./exporters.server");
      // Cast for RLS-scoped shapes
      const scanRow = scan as unknown as Parameters<typeof mod.buildDTO>[0];
      const pageRows = (pages ?? []) as unknown as Parameters<typeof mod.buildDTO>[1];
      const issueRows = (issues ?? []) as unknown as Parameters<typeof mod.buildDTO>[2];
      const dto = mod.buildDTO(scanRow, pageRows, issueRows, data.format, data.reportType);

      if (data.format === "pdf") {
        base64 = mod.exportPDF(dto, data.sections, data.reportType);
      } else if (data.format === "xlsx") {
        base64 = mod.exportXLSX(dto, data.sections, data.reportType);
      } else if (data.format === "json") {
        base64 = mod.exportJSON(dto);
      } else {
        const res = await mod.exportCSV(dto, data.sections, data.reportType);
        base64 = res.base64;
        if (res.multi) {
          ext = "zip" as typeof data.format;
          mimeType = MIME.zip;
        }
      }

      await supabase.from("export_logs").insert({
        user_id: userId,
        scan_id: data.scanId,
        format: data.format,
        report_type: data.reportType,
        file_name: `${baseName}.${ext}`,
        status: "success",
      });

      return {
        fileName: `${baseName}.${ext}`,
        mimeType,
        base64,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao gerar arquivo";
      await supabase.from("export_logs").insert({
        user_id: userId,
        scan_id: data.scanId,
        format: data.format,
        report_type: data.reportType,
        file_name: `${baseName}.${data.format}`,
        status: "failed",
        error_message: msg,
      });
      throw new Error(msg);
    }
  });
