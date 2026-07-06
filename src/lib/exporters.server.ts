// Server-only export generators for SEO scan reports.
// Produces base64-encoded artifacts (PDF, XLSX, CSV-zip, JSON).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import JSZip from "jszip";

export type ReportFormat = "pdf" | "xlsx" | "csv" | "json";
export type ReportType = "executive" | "technical" | "complete";

export interface ExportSections {
  executiveSummary?: boolean;
  scores?: boolean;
  diagnosis?: boolean;
  topIssues?: boolean;
  issuesByCategory?: boolean;
  pages?: boolean;
  aiReport?: boolean;
  roadmap?: boolean;
  technicalRecommendations?: boolean;
  technicalData?: boolean;
  history?: boolean;
}

// Loose typing since scan comes as JSON from DB.
interface ScanRow {
  id: string;
  url: string;
  host: string;
  status: string;
  pages_crawled: number;
  scores: Record<string, number> | null;
  started_at: string;
  finished_at: string | null;
  ai_report: {
    executive_summary?: string;
    top_issues?: { title: string; severity: string; why_it_matters?: string; how_to_fix?: string }[];
    quick_wins?: string[];
    roadmap?: { week: string; tasks: string[] }[];
    seo_recommendations?: string[];
    ux_recommendations?: string[];
  } | null;
}
interface IssueRow {
  id: string;
  scan_id: string;
  page_id: string | null;
  category: string;
  severity: string;
  title: string;
  description: string | null;
  recommendation: string | null;
  impact: string | null;
  effort: string | null;
}
interface PageRow {
  id: string;
  url: string;
  status_code: number | null;
  response_ms: number | null;
  size_bytes: number | null;
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  robots_meta: string | null;
  lang: string | null;
  viewport: string | null;
  h1_count: number | null;
  h2_count: number | null;
  word_count: number | null;
  images_total: number | null;
  images_missing_alt: number | null;
  links_internal: number | null;
  links_external: number | null;
  is_https: boolean | null;
  has_og: boolean | null;
  has_schema: boolean | null;
}

export interface ReportDTO {
  metadata: {
    system: string;
    exportedAt: string;
    reportType: ReportType;
    format: ReportFormat;
  };
  scan: {
    id: string;
    url: string;
    host: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    pagesCrawled: number;
  };
  scores: Record<string, number>;
  summary: {
    totalPages: number;
    totalIssues: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    avgResponseMs: number;
    missingTitle: number;
    missingMetaDescription: number;
    imagesWithoutAlt: number;
    non200Pages: number;
    indexationIssues: number;
    topCategories: { category: string; count: number }[];
    quickWins: string[];
  };
  issues: IssueRow[];
  topIssues: IssueRow[];
  pages: PageRow[];
  aiReport: ScanRow["ai_report"];
  roadmap: { week: string; tasks: string[] }[];
  recommendations: { seo: string[]; ux: string[] };
  technicalData: {
    pagesWithoutCanonical: number;
    pagesWithoutOg: number;
    pagesWithoutSchema: number;
    nonHttpsPages: number;
    avgWordCount: number;
    totalLinksInternal: number;
    totalLinksExternal: number;
  };
  history: unknown[];
}

const SEV_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const IMPACT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const EFFORT_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 };
const CATEGORY_PRIORITY: Record<string, number> = { seo: 0, indexation: 1, performance: 2 };

const DEFAULT_ROADMAP = [
  {
    week: "Semana 1 — Correções rápidas",
    tasks: ["Ajustar titles ausentes/duplicados", "Escrever meta descriptions", "Garantir 1 H1 único por página", "Adicionar ALT em imagens", "Corrigir links quebrados", "Configurar canonical corretamente"],
  },
  {
    week: "Semana 2 — Melhorias técnicas",
    tasks: ["Otimizar performance (LCP, CLS)", "Habilitar cache e compressão", "Revisar responsividade mobile", "Implementar Structured Data (schema.org)", "Publicar sitemap.xml e robots.txt"],
  },
  {
    week: "Semana 3 — Crescimento e autoridade",
    tasks: ["Produzir conteúdo estratégico", "Fortalecer SEO local (se aplicável)", "Melhorar linkagem interna", "Trabalhar sinais de EEAT", "Otimizar UX e taxa de conversão"],
  },
];

export function buildDTO(
  scan: ScanRow,
  pages: PageRow[],
  issues: IssueRow[],
  format: ReportFormat,
  reportType: ReportType,
): ReportDTO {
  const scores = (scan.scores ?? {}) as Record<string, number>;
  const sevCount = (s: string) => issues.filter((i) => i.severity === s).length;
  const catMap = new Map<string, number>();
  issues.forEach((i) => catMap.set(i.category, (catMap.get(i.category) ?? 0) + 1));
  const topCategories = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  const avg = (arr: (number | null)[]) => {
    const nums = arr.filter((n): n is number => typeof n === "number");
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  };

  const sortedIssues = [...issues].sort((a, b) => {
    const s = (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
    if (s !== 0) return s;
    const im = (IMPACT_ORDER[a.impact ?? "low"] ?? 9) - (IMPACT_ORDER[b.impact ?? "low"] ?? 9);
    if (im !== 0) return im;
    const ef = (EFFORT_ORDER[a.effort ?? "high"] ?? 9) - (EFFORT_ORDER[b.effort ?? "high"] ?? 9);
    if (ef !== 0) return ef;
    return (CATEGORY_PRIORITY[a.category] ?? 9) - (CATEGORY_PRIORITY[b.category] ?? 9);
  });

  const ai = scan.ai_report;
  const roadmap = ai?.roadmap && ai.roadmap.length > 0 ? ai.roadmap : DEFAULT_ROADMAP;

  return {
    metadata: {
      system: "SEO Navigator AI",
      exportedAt: new Date().toISOString(),
      reportType,
      format,
    },
    scan: {
      id: scan.id,
      url: scan.url,
      host: scan.host,
      status: scan.status,
      startedAt: scan.started_at,
      finishedAt: scan.finished_at,
      pagesCrawled: scan.pages_crawled,
    },
    scores,
    summary: {
      totalPages: pages.length,
      totalIssues: issues.length,
      highSeverity: sevCount("high"),
      mediumSeverity: sevCount("medium"),
      lowSeverity: sevCount("low"),
      avgResponseMs: avg(pages.map((p) => p.response_ms)),
      missingTitle: pages.filter((p) => !p.title).length,
      missingMetaDescription: pages.filter((p) => !p.meta_description).length,
      imagesWithoutAlt: pages.reduce((s, p) => s + (p.images_missing_alt ?? 0), 0),
      non200Pages: pages.filter((p) => p.status_code !== 200).length,
      indexationIssues: pages.filter((p) => (p.robots_meta ?? "").toLowerCase().includes("noindex")).length,
      topCategories,
      quickWins: ai?.quick_wins ?? [],
    },
    issues,
    topIssues: sortedIssues.slice(0, 10),
    pages,
    aiReport: ai,
    roadmap,
    recommendations: {
      seo: ai?.seo_recommendations ?? [],
      ux: ai?.ux_recommendations ?? [],
    },
    technicalData: {
      pagesWithoutCanonical: pages.filter((p) => !p.canonical).length,
      pagesWithoutOg: pages.filter((p) => !p.has_og).length,
      pagesWithoutSchema: pages.filter((p) => !p.has_schema).length,
      nonHttpsPages: pages.filter((p) => p.is_https === false).length,
      avgWordCount: avg(pages.map((p) => p.word_count)),
      totalLinksInternal: pages.reduce((s, p) => s + (p.links_internal ?? 0), 0),
      totalLinksExternal: pages.reduce((s, p) => s + (p.links_external ?? 0), 0),
    },
    history: [],
  };
}

// Utilities
function toB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in worker runtime
  return btoa(bin);
}
function strToB64(s: string): string {
  return toB64(new TextEncoder().encode(s));
}

function sevLabel(s: string): string {
  const l = s.toLowerCase();
  if (l === "high") return "Alta";
  if (l === "medium") return "Média";
  return "Baixa";
}

function sectionsFor(reportType: ReportType, requested: ExportSections): Required<ExportSections> {
  const all: Required<ExportSections> = {
    executiveSummary: true, scores: true, diagnosis: true, topIssues: true,
    issuesByCategory: true, pages: true, aiReport: true, roadmap: true,
    technicalRecommendations: true, technicalData: true, history: false,
  };
  if (reportType === "executive") {
    return { ...all, pages: false, issuesByCategory: false, technicalData: false, technicalRecommendations: false, ...requested };
  }
  if (reportType === "technical") {
    return { ...all, executiveSummary: false, roadmap: false, aiReport: false, ...requested };
  }
  return { ...all, ...requested };
}

// -------- PDF --------
export function exportPDF(dto: ReportDTO, requested: ExportSections, reportType: ReportType): string {
  const sections = sectionsFor(reportType, requested);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const NAVY = [11, 22, 45] as const;
  const TEAL = [20, 184, 166] as const;
  const AMBER = [245, 158, 11] as const;
  const MUTED = [107, 114, 128] as const;

  const addFooter = () => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(`SEO Navigator AI  ·  ${dto.scan.host}`, 40, pageH - 20);
      doc.text(`Página ${i} / ${total}`, pageW - 40, pageH - 20, { align: "right" });
    }
  };

  // Cover
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setTextColor(...TEAL);
  doc.setFontSize(12);
  doc.text("SEO NAVIGATOR AI", 40, 80);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.text("Relatório de Auditoria SEO", 40, 140);
  doc.setFontSize(14);
  doc.setTextColor(...AMBER);
  doc.text(dto.scan.host, 40, 175);
  doc.setTextColor(220, 220, 230);
  doc.setFontSize(11);
  doc.text(`URL analisada: ${dto.scan.url}`, 40, 210);
  doc.text(`Iniciado em: ${new Date(dto.scan.startedAt).toLocaleString("pt-BR")}`, 40, 228);
  if (dto.scan.finishedAt) doc.text(`Concluído em: ${new Date(dto.scan.finishedAt).toLocaleString("pt-BR")}`, 40, 246);
  doc.text(`Páginas rastreadas: ${dto.scan.pagesCrawled}`, 40, 264);
  const typeLabel = reportType === "executive" ? "Executivo" : reportType === "technical" ? "Técnico" : "Completo";
  doc.text(`Tipo de relatório: ${typeLabel}`, 40, 282);

  // Score badge
  const scoreOverall = dto.scores.overall ?? 0;
  doc.setFillColor(...TEAL);
  doc.roundedRect(pageW - 180, 380, 140, 140, 12, 12, "F");
  doc.setTextColor(11, 22, 45);
  doc.setFontSize(36);
  doc.text(`${Math.round(scoreOverall)}`, pageW - 110, 445, { align: "center" });
  doc.setFontSize(10);
  doc.text("SCORE GERAL", pageW - 110, 495, { align: "center" });

  doc.setTextColor(220, 220, 230);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date(dto.metadata.exportedAt).toLocaleString("pt-BR")}`, 40, pageH - 40);

  // Content pages
  doc.addPage();
  let y = 60;
  const marginX = 40;
  const contentW = pageW - marginX * 2;

  const heading = (t: string) => {
    if (y > pageH - 90) { doc.addPage(); y = 60; }
    doc.setTextColor(...NAVY);
    doc.setFontSize(16);
    doc.text(t, marginX, y);
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(2);
    doc.line(marginX, y + 6, marginX + 60, y + 6);
    y += 28;
  };
  const paragraph = (t: string) => {
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(t, contentW);
    for (const ln of lines) {
      if (y > pageH - 60) { doc.addPage(); y = 60; }
      doc.text(ln, marginX, y);
      y += 14;
    }
    y += 6;
  };

  if (sections.executiveSummary && dto.aiReport?.executive_summary) {
    heading("Resumo Executivo");
    paragraph(dto.aiReport.executive_summary);
  }

  if (sections.scores) {
    heading("Scores por Categoria");
    const rows = Object.entries(dto.scores).map(([k, v]) => [k.toUpperCase(), `${Math.round(v)}/100`]);
    autoTable(doc, {
      startY: y,
      head: [["Categoria", "Pontuação"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [11, 22, 45], textColor: 255 },
      margin: { left: marginX, right: marginX },
    });
    // @ts-expect-error lastAutoTable is added by plugin
    y = doc.lastAutoTable.finalY + 20;
  }

  if (sections.diagnosis) {
    heading("Diagnóstico Geral");
    const s = dto.summary;
    autoTable(doc, {
      startY: y,
      body: [
        ["Total de páginas rastreadas", `${s.totalPages}`],
        ["Total de problemas", `${s.totalIssues}`],
        ["Criticidade alta", `${s.highSeverity}`],
        ["Criticidade média", `${s.mediumSeverity}`],
        ["Criticidade baixa", `${s.lowSeverity}`],
        ["Tempo médio de resposta", `${s.avgResponseMs} ms`],
        ["Páginas sem title", `${s.missingTitle}`],
        ["Páginas sem meta description", `${s.missingMetaDescription}`],
        ["Imagens sem ALT", `${s.imagesWithoutAlt}`],
        ["Páginas com status ≠ 200", `${s.non200Pages}`],
        ["Páginas com problemas de indexação", `${s.indexationIssues}`],
      ],
      theme: "striped",
      margin: { left: marginX, right: marginX },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 20;
  }

  if (sections.topIssues && dto.topIssues.length > 0) {
    heading("Top 10 Problemas Críticos");
    autoTable(doc, {
      startY: y,
      head: [["#", "Problema", "Categoria", "Severidade", "Impacto", "Esforço"]],
      body: dto.topIssues.map((i, idx) => [
        `${idx + 1}`, i.title, i.category, sevLabel(i.severity), i.impact ?? "—", i.effort ?? "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: [11, 22, 45], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 200 } },
      margin: { left: marginX, right: marginX },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 20;
  }

  if (sections.issuesByCategory) {
    heading("Problemas por Categoria");
    const byCat = new Map<string, IssueRow[]>();
    dto.issues.forEach((i) => {
      const arr = byCat.get(i.category) ?? [];
      arr.push(i);
      byCat.set(i.category, arr);
    });
    for (const [cat, list] of byCat) {
      if (y > pageH - 120) { doc.addPage(); y = 60; }
      doc.setFontSize(12); doc.setTextColor(...NAVY);
      doc.text(`${cat} (${list.length})`, marginX, y); y += 14;
      autoTable(doc, {
        startY: y,
        head: [["Título", "Sev.", "Recomendação"]],
        body: list.slice(0, 20).map((i) => [i.title, sevLabel(i.severity), i.recommendation ?? "—"]),
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [20, 184, 166], textColor: 255 },
        margin: { left: marginX, right: marginX },
      });
      // @ts-expect-error
      y = doc.lastAutoTable.finalY + 12;
    }
  }

  if (sections.aiReport && dto.aiReport) {
    if (dto.aiReport.top_issues) {
      heading("Parecer da IA — Problemas Prioritários");
      dto.aiReport.top_issues.forEach((it, i) => {
        if (y > pageH - 100) { doc.addPage(); y = 60; }
        doc.setFontSize(11); doc.setTextColor(...NAVY);
        doc.text(`${i + 1}. ${it.title}`, marginX, y); y += 14;
        if (it.why_it_matters) paragraph(`Por que importa: ${it.why_it_matters}`);
        if (it.how_to_fix) paragraph(`Como corrigir: ${it.how_to_fix}`);
      });
    }
    if (dto.aiReport.quick_wins?.length) {
      heading("Quick Wins");
      dto.aiReport.quick_wins.forEach((q) => paragraph(`⚡ ${q}`));
    }
  }

  if (sections.roadmap) {
    heading("Roadmap");
    dto.roadmap.forEach((w) => {
      if (y > pageH - 90) { doc.addPage(); y = 60; }
      doc.setFontSize(12); doc.setTextColor(...AMBER);
      doc.text(w.week, marginX, y); y += 16;
      w.tasks.forEach((t) => paragraph(`• ${t}`));
      y += 4;
    });
  }

  if (sections.technicalRecommendations && (dto.recommendations.seo.length || dto.recommendations.ux.length)) {
    heading("Recomendações Técnicas");
    if (dto.recommendations.seo.length) {
      doc.setFontSize(11); doc.setTextColor(...NAVY);
      doc.text("SEO", marginX, y); y += 14;
      dto.recommendations.seo.forEach((r) => paragraph(`• ${r}`));
    }
    if (dto.recommendations.ux.length) {
      doc.setFontSize(11); doc.setTextColor(...NAVY);
      doc.text("UX", marginX, y); y += 14;
      dto.recommendations.ux.forEach((r) => paragraph(`• ${r}`));
    }
  }

  if (sections.pages && dto.pages.length > 0) {
    heading("Páginas Rastreadas");
    autoTable(doc, {
      startY: y,
      head: [["URL", "Status", "Tempo (ms)", "Palavras", "Title"]],
      body: dto.pages.map((p) => [
        p.url, `${p.status_code ?? "—"}`, `${p.response_ms ?? "—"}`, `${p.word_count ?? 0}`, (p.title ?? "—").slice(0, 60),
      ]),
      theme: "striped",
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [11, 22, 45], textColor: 255 },
      columnStyles: { 0: { cellWidth: 200 } },
      margin: { left: marginX, right: marginX },
    });
    // @ts-expect-error
    y = doc.lastAutoTable.finalY + 20;
  }

  if (sections.technicalData) {
    heading("Anexos Técnicos");
    const t = dto.technicalData;
    autoTable(doc, {
      startY: y,
      body: [
        ["Páginas sem canonical", `${t.pagesWithoutCanonical}`],
        ["Páginas sem Open Graph", `${t.pagesWithoutOg}`],
        ["Páginas sem Schema.org", `${t.pagesWithoutSchema}`],
        ["Páginas fora de HTTPS", `${t.nonHttpsPages}`],
        ["Média de palavras por página", `${t.avgWordCount}`],
        ["Total de links internos", `${t.totalLinksInternal}`],
        ["Total de links externos", `${t.totalLinksExternal}`],
      ],
      theme: "grid",
      margin: { left: marginX, right: marginX },
    });
  }

  addFooter();
  const arr = doc.output("arraybuffer");
  return toB64(new Uint8Array(arr));
}

// -------- XLSX --------
export function exportXLSX(dto: ReportDTO, requested: ExportSections, reportType: ReportType): string {
  const sections = sectionsFor(reportType, requested);
  const wb = XLSX.utils.book_new();

  const appendSheet = (name: string, aoa: (string | number | null)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Freeze header row + autofilter
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    if (aoa.length > 1 && aoa[0].length > 0) {
      const range = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } });
      ws["!autofilter"] = { ref: range };
    }
    // Column widths
    const widths = aoa[0].map((_, ci) => {
      const max = Math.max(...aoa.map((r) => `${r[ci] ?? ""}`.length));
      return { wch: Math.min(60, Math.max(10, max + 2)) };
    });
    ws["!cols"] = widths;
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  // Resumo
  appendSheet("Resumo", [
    ["Campo", "Valor"],
    ["URL analisada", dto.scan.url],
    ["Host", dto.scan.host],
    ["Iniciado em", dto.scan.startedAt],
    ["Concluído em", dto.scan.finishedAt ?? ""],
    ["Score geral", `${Math.round(dto.scores.overall ?? 0)}%`],
    ["Total de páginas", dto.summary.totalPages],
    ["Total de issues", dto.summary.totalIssues],
    ["Issues alta", dto.summary.highSeverity],
    ["Issues média", dto.summary.mediumSeverity],
    ["Issues baixa", dto.summary.lowSeverity],
    ["Tempo médio (ms)", dto.summary.avgResponseMs],
    ["Categorias afetadas", dto.summary.topCategories.map((c) => `${c.category}(${c.count})`).join(", ")],
    ["Quick wins", dto.summary.quickWins.join(" | ")],
  ]);

  if (sections.scores) {
    appendSheet("Scores", [["Categoria", "Pontuação (%)"], ...Object.entries(dto.scores).map(([k, v]) => [k, Math.round(v)])]);
  }
  if (sections.topIssues) {
    appendSheet("Top 10", [
      ["#", "Título", "Categoria", "Severidade", "Impacto", "Esforço", "Recomendação"],
      ...dto.topIssues.map((i, idx) => [idx + 1, i.title, i.category, sevLabel(i.severity), i.impact ?? "", i.effort ?? "", i.recommendation ?? ""]),
    ]);
  }
  appendSheet("Issues", [
    ["ID", "Página", "Título", "Categoria", "Severidade", "Impacto", "Esforço", "Descrição", "Recomendação"],
    ...dto.issues.map((i) => [i.id, i.page_id ?? "", i.title, i.category, sevLabel(i.severity), i.impact ?? "", i.effort ?? "", i.description ?? "", i.recommendation ?? ""]),
  ]);
  if (sections.pages) {
    appendSheet("Paginas", [
      ["URL", "Status HTTP", "Tempo (ms)", "Tamanho", "Title", "Meta description", "Canonical", "Robots", "Lang", "Viewport", "H1", "H2", "Palavras", "Imgs sem ALT", "Links int.", "Links ext.", "HTTPS"],
      ...dto.pages.map((p) => [
        p.url, p.status_code ?? "", p.response_ms ?? "", p.size_bytes ?? "",
        p.title ?? "", p.meta_description ?? "", p.canonical ?? "", p.robots_meta ?? "",
        p.lang ?? "", p.viewport ?? "", p.h1_count ?? 0, p.h2_count ?? 0, p.word_count ?? 0,
        p.images_missing_alt ?? 0, p.links_internal ?? 0, p.links_external ?? 0,
        p.is_https ? "Sim" : "Não",
      ]),
    ]);
  }
  if (sections.roadmap) {
    const rows: (string | number)[][] = [["Semana", "Tarefa"]];
    dto.roadmap.forEach((w) => w.tasks.forEach((t) => rows.push([w.week, t])));
    appendSheet("Roadmap", rows);
  }
  if (sections.aiReport && dto.aiReport) {
    const rows: (string | number)[][] = [["Seção", "Conteúdo"]];
    if (dto.aiReport.executive_summary) rows.push(["Resumo executivo", dto.aiReport.executive_summary]);
    (dto.aiReport.quick_wins ?? []).forEach((q) => rows.push(["Quick win", q]));
    (dto.aiReport.seo_recommendations ?? []).forEach((r) => rows.push(["Recomendação SEO", r]));
    (dto.aiReport.ux_recommendations ?? []).forEach((r) => rows.push(["Recomendação UX", r]));
    appendSheet("IA", rows);
  }
  if (sections.technicalData) {
    const t = dto.technicalData;
    appendSheet("Dados Tecnicos", [
      ["Métrica", "Valor"],
      ["Páginas sem canonical", t.pagesWithoutCanonical],
      ["Páginas sem OG", t.pagesWithoutOg],
      ["Páginas sem Schema", t.pagesWithoutSchema],
      ["Páginas fora de HTTPS", t.nonHttpsPages],
      ["Média de palavras", t.avgWordCount],
      ["Total links internos", t.totalLinksInternal],
      ["Total links externos", t.totalLinksExternal],
    ]);
  }

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return toB64(new Uint8Array(buf));
}

// -------- CSV --------
function toCSV(rows: (string | number | null)[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (s.includes(";") || s.includes("\n") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export async function exportCSV(
  dto: ReportDTO,
  requested: ExportSections,
  reportType: ReportType,
): Promise<{ base64: string; multi: boolean }> {
  const sections = sectionsFor(reportType, requested);
  const files: Record<string, string> = {};

  files["summary.csv"] = toCSV([
    ["campo", "valor"],
    ["url", dto.scan.url],
    ["host", dto.scan.host],
    ["started_at", dto.scan.startedAt],
    ["finished_at", dto.scan.finishedAt ?? ""],
    ["overall_score", Math.round(dto.scores.overall ?? 0)],
    ["total_pages", dto.summary.totalPages],
    ["total_issues", dto.summary.totalIssues],
    ["high", dto.summary.highSeverity],
    ["medium", dto.summary.mediumSeverity],
    ["low", dto.summary.lowSeverity],
  ]);
  if (sections.scores) {
    files["scores.csv"] = toCSV([["categoria", "score"], ...Object.entries(dto.scores).map(([k, v]) => [k, Math.round(v)])]);
  }
  files["issues.csv"] = toCSV([
    ["id", "page_id", "titulo", "categoria", "severidade", "impacto", "esforco", "descricao", "recomendacao"],
    ...dto.issues.map((i) => [i.id, i.page_id ?? "", i.title, i.category, sevLabel(i.severity), i.impact ?? "", i.effort ?? "", i.description ?? "", i.recommendation ?? ""]),
  ]);
  if (sections.topIssues) {
    files["top_issues.csv"] = toCSV([
      ["#", "titulo", "categoria", "severidade", "impacto", "esforco", "recomendacao"],
      ...dto.topIssues.map((i, idx) => [idx + 1, i.title, i.category, sevLabel(i.severity), i.impact ?? "", i.effort ?? "", i.recommendation ?? ""]),
    ]);
  }
  if (sections.pages) {
    files["pages.csv"] = toCSV([
      ["url", "status", "response_ms", "size", "title", "meta_description", "canonical", "robots", "lang", "h1", "h2", "words", "imgs_no_alt", "links_int", "links_ext", "https"],
      ...dto.pages.map((p) => [
        p.url, p.status_code ?? "", p.response_ms ?? "", p.size_bytes ?? "",
        p.title ?? "", p.meta_description ?? "", p.canonical ?? "", p.robots_meta ?? "",
        p.lang ?? "", p.h1_count ?? 0, p.h2_count ?? 0, p.word_count ?? 0,
        p.images_missing_alt ?? 0, p.links_internal ?? 0, p.links_external ?? 0,
        p.is_https ? "1" : "0",
      ]),
    ]);
  }
  if (sections.roadmap) {
    const rows: (string | number)[][] = [["semana", "tarefa"]];
    dto.roadmap.forEach((w) => w.tasks.forEach((t) => rows.push([w.week, t])));
    files["roadmap.csv"] = toCSV(rows);
  }
  if (sections.technicalData) {
    const t = dto.technicalData;
    files["technical_data.csv"] = toCSV([
      ["metrica", "valor"],
      ["pages_without_canonical", t.pagesWithoutCanonical],
      ["pages_without_og", t.pagesWithoutOg],
      ["pages_without_schema", t.pagesWithoutSchema],
      ["non_https_pages", t.nonHttpsPages],
      ["avg_word_count", t.avgWordCount],
      ["links_internal_total", t.totalLinksInternal],
      ["links_external_total", t.totalLinksExternal],
    ]);
  }

  const names = Object.keys(files);
  if (names.length === 1) {
    return { base64: strToB64(files[names[0]]), multi: false };
  }
  const zip = new JSZip();
  for (const [n, c] of Object.entries(files)) zip.file(n, c);
  const buf = await zip.generateAsync({ type: "uint8array" });
  return { base64: toB64(buf), multi: true };
}

// -------- JSON --------
export function exportJSON(dto: ReportDTO): string {
  return strToB64(JSON.stringify(dto, null, 2));
}
