// Server-only helpers: scan comparison logic + AI evolution report.

export type Severity = "high" | "medium" | "low";

interface RawIssue {
  id: string;
  scan_id: string;
  page_id: string | null;
  category: string;
  severity: Severity;
  title: string;
  description: string | null;
  recommendation: string | null;
  impact: string | null;
  effort: string | null;
}
interface RawPage {
  id: string;
  url: string;
  status_code: number | null;
  response_ms: number | null;
  title: string | null;
  meta_description: string | null;
}
export interface RawScan {
  id: string;
  url: string;
  host: string;
  status: string;
  pages_crawled: number;
  scores: Record<string, number> | null;
  started_at: string;
  finished_at: string | null;
}

const SEV_WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const SEV_LABEL: Record<Severity, string> = { high: "Alta", medium: "Média", low: "Baixa" };

function normalizeUrl(u: string | null | undefined): string {
  if (!u) return "";
  try {
    const parsed = new URL(u);
    return `${parsed.hostname}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function issueKey(i: RawIssue, pageUrlById: Map<string, string>): string {
  const url = i.page_id ? normalizeUrl(pageUrlById.get(i.page_id)) : "site";
  const title = i.title.toLowerCase().trim().slice(0, 120);
  return `${i.category}|${title}|${url}`;
}

function trend(delta: number): "up" | "down" | "flat" {
  if (delta > 1) return "up";
  if (delta < -1) return "down";
  return "flat";
}

export interface ScoreDelta {
  category: string;
  previous: number;
  current: number;
  delta: number;
  trend: "up" | "down" | "flat";
}

export interface IssueDiffItem {
  key: string;
  title: string;
  category: string;
  severity: Severity;
  severityLabel: string;
  url: string;
  impact: string | null;
  effort: string | null;
  recommendation: string | null;
}

export interface PageChange {
  url: string;
  change: string;
  previous: { status: number | null; responseMs: number | null; title: string | null } | null;
  current: { status: number | null; responseMs: number | null; title: string | null } | null;
}

export interface ComparisonDTO {
  previousScan: RawScan;
  currentScan: RawScan;
  sameHost: boolean;
  scoreDelta: ScoreDelta[];
  summary: {
    overallPrevious: number;
    overallCurrent: number;
    overallDelta: number;
    overallPct: number;
    issuesPrevious: number;
    issuesCurrent: number;
    fixed: number;
    added: number;
    persistent: number;
    highBefore: number;
    highAfter: number;
    pagesPrevious: number;
    pagesCurrent: number;
  };
  fixedIssues: IssueDiffItem[];
  newIssues: IssueDiffItem[];
  persistentIssues: IssueDiffItem[];
  improvedIssues: { title: string; category: string; before: string; after: string; delta: number }[];
  worsenedIssues: { title: string; category: string; before: string; after: string; delta: number }[];
  pageChanges: PageChange[];
  aiEvolutionReport: EvolutionReport | null;
}

export interface EvolutionReport {
  summary: string;
  improvements: string[];
  regressions: string[];
  risks: string[];
  next7Days: string[];
  next30Days: string[];
}

export function buildComparison(
  prev: { scan: RawScan; pages: RawPage[]; issues: RawIssue[] },
  curr: { scan: RawScan; pages: RawPage[]; issues: RawIssue[] },
): Omit<ComparisonDTO, "aiEvolutionReport"> {
  const prevScores = prev.scan.scores ?? {};
  const currScores = curr.scan.scores ?? {};
  const categories = ["overall", "seo", "performance", "content", "accessibility", "mobile", "security", "indexation"];
  const scoreDelta: ScoreDelta[] = categories.map((c) => {
    const p = Math.round(prevScores[c] ?? 0);
    const cu = Math.round(currScores[c] ?? 0);
    const d = cu - p;
    return { category: c, previous: p, current: cu, delta: d, trend: trend(d) };
  });

  const prevPageUrl = new Map(prev.pages.map((p) => [p.id, p.url] as const));
  const currPageUrl = new Map(curr.pages.map((p) => [p.id, p.url] as const));

  const prevMap = new Map<string, RawIssue[]>();
  const currMap = new Map<string, RawIssue[]>();
  prev.issues.forEach((i) => {
    const k = issueKey(i, prevPageUrl);
    const arr = prevMap.get(k) ?? [];
    arr.push(i); prevMap.set(k, arr);
  });
  curr.issues.forEach((i) => {
    const k = issueKey(i, currPageUrl);
    const arr = currMap.get(k) ?? [];
    arr.push(i); currMap.set(k, arr);
  });

  const toItem = (i: RawIssue, urlMap: Map<string, string>): IssueDiffItem => ({
    key: issueKey(i, urlMap),
    title: i.title,
    category: i.category,
    severity: i.severity,
    severityLabel: SEV_LABEL[i.severity] ?? i.severity,
    url: i.page_id ? (urlMap.get(i.page_id) ?? "site") : "site",
    impact: i.impact,
    effort: i.effort,
    recommendation: i.recommendation,
  });

  const fixed: IssueDiffItem[] = [];
  const added: IssueDiffItem[] = [];
  const persistent: IssueDiffItem[] = [];
  const improved: ComparisonDTO["improvedIssues"] = [];
  const worsened: ComparisonDTO["worsenedIssues"] = [];

  for (const [k, prevArr] of prevMap) {
    if (!currMap.has(k)) {
      fixed.push(toItem(prevArr[0], prevPageUrl));
    } else {
      const currArr = currMap.get(k)!;
      persistent.push(toItem(currArr[0], currPageUrl));
      const pSev = Math.max(...prevArr.map((i) => SEV_WEIGHT[i.severity]));
      const cSev = Math.max(...currArr.map((i) => SEV_WEIGHT[i.severity]));
      if (cSev > pSev || currArr.length > prevArr.length) {
        worsened.push({
          title: currArr[0].title,
          category: currArr[0].category,
          before: `${prevArr.length}x ${SEV_LABEL[prevArr[0].severity]}`,
          after: `${currArr.length}x ${SEV_LABEL[currArr[0].severity]}`,
          delta: cSev - pSev + (currArr.length - prevArr.length),
        });
      } else if (cSev < pSev || currArr.length < prevArr.length) {
        improved.push({
          title: currArr[0].title,
          category: currArr[0].category,
          before: `${prevArr.length}x ${SEV_LABEL[prevArr[0].severity]}`,
          after: `${currArr.length}x ${SEV_LABEL[currArr[0].severity]}`,
          delta: pSev - cSev + (prevArr.length - currArr.length),
        });
      }
    }
  }
  for (const [k, currArr] of currMap) {
    if (!prevMap.has(k)) added.push(toItem(currArr[0], currPageUrl));
  }

  // Page changes
  const prevByUrl = new Map(prev.pages.map((p) => [normalizeUrl(p.url), p] as const));
  const currByUrl = new Map(curr.pages.map((p) => [normalizeUrl(p.url), p] as const));
  const pageChanges: PageChange[] = [];
  for (const [k, p] of prevByUrl) {
    if (!currByUrl.has(k)) {
      pageChanges.push({
        url: p.url, change: "Página removida",
        previous: { status: p.status_code, responseMs: p.response_ms, title: p.title },
        current: null,
      });
    }
  }
  for (const [k, c] of currByUrl) {
    const p = prevByUrl.get(k);
    if (!p) {
      pageChanges.push({
        url: c.url, change: "Página nova",
        previous: null,
        current: { status: c.status_code, responseMs: c.response_ms, title: c.title },
      });
      continue;
    }
    const changes: string[] = [];
    if (p.status_code !== c.status_code) changes.push(`Status ${p.status_code ?? "?"} → ${c.status_code ?? "?"}`);
    if (p.title && !c.title) changes.push("Perdeu title");
    if (!p.title && c.title) changes.push("Ganhou title");
    if (p.meta_description && !c.meta_description) changes.push("Perdeu meta description");
    if (!p.meta_description && c.meta_description) changes.push("Ganhou meta description");
    if (p.response_ms != null && c.response_ms != null) {
      const diff = c.response_ms - p.response_ms;
      if (Math.abs(diff) > 200) changes.push(diff > 0 ? `Ficou ${diff}ms mais lenta` : `Ficou ${-diff}ms mais rápida`);
    }
    if (changes.length > 0) {
      pageChanges.push({
        url: c.url, change: changes.join(" · "),
        previous: { status: p.status_code, responseMs: p.response_ms, title: p.title },
        current: { status: c.status_code, responseMs: c.response_ms, title: c.title },
      });
    }
  }

  const highBefore = prev.issues.filter((i) => i.severity === "high").length;
  const highAfter = curr.issues.filter((i) => i.severity === "high").length;
  const overallPrevious = Math.round(prevScores.overall ?? 0);
  const overallCurrent = Math.round(currScores.overall ?? 0);
  const overallDelta = overallCurrent - overallPrevious;
  const overallPct = overallPrevious === 0 ? 0 : Math.round((overallDelta / overallPrevious) * 1000) / 10;

  return {
    previousScan: prev.scan,
    currentScan: curr.scan,
    sameHost: prev.scan.host === curr.scan.host,
    scoreDelta,
    summary: {
      overallPrevious, overallCurrent, overallDelta, overallPct,
      issuesPrevious: prev.issues.length,
      issuesCurrent: curr.issues.length,
      fixed: fixed.length,
      added: added.length,
      persistent: persistent.length,
      highBefore, highAfter,
      pagesPrevious: prev.pages.length,
      pagesCurrent: curr.pages.length,
    },
    fixedIssues: fixed.slice(0, 100),
    newIssues: added.slice(0, 100),
    persistentIssues: persistent.slice(0, 100),
    improvedIssues: improved.sort((a, b) => b.delta - a.delta).slice(0, 50),
    worsenedIssues: worsened.sort((a, b) => b.delta - a.delta).slice(0, 50),
    pageChanges: pageChanges.slice(0, 200),
  };
}

export async function generateEvolutionReport(
  dto: Omit<ComparisonDTO, "aiEvolutionReport">,
): Promise<EvolutionReport | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const facts = {
    host: dto.currentScan.host,
    same_host: dto.sameHost,
    previous_date: dto.previousScan.finished_at ?? dto.previousScan.started_at,
    current_date: dto.currentScan.finished_at ?? dto.currentScan.started_at,
    scores: dto.scoreDelta,
    summary: dto.summary,
    fixed_sample: dto.fixedIssues.slice(0, 10).map((i) => ({ title: i.title, category: i.category, severity: i.severity })),
    new_sample: dto.newIssues.slice(0, 10).map((i) => ({ title: i.title, category: i.category, severity: i.severity })),
    worsened_sample: dto.worsenedIssues.slice(0, 10),
    page_changes_count: dto.pageChanges.length,
  };

  const prompt = `Você é um consultor SEO sênior. Analise a EVOLUÇÃO entre duas auditorias SEO deste site.
Responda APENAS com JSON VÁLIDO em PT-BR:
{
  "summary": "2-3 parágrafos executivos sobre a evolução",
  "improvements": ["ponto1", "ponto2", ...],
  "regressions": ["ponto1", "ponto2", ...],
  "risks": ["risco1", "risco2", ...],
  "next7Days": ["ação1", ...],
  "next30Days": ["ação1", ...]
}

DADOS:
${JSON.stringify(facts, null, 2)}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert SEO consultant. Respond only with valid JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[compare] AI gateway", res.status, await res.text());
      return null;
    }
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as EvolutionReport;
  } catch (err) {
    console.error("[compare] AI failed", err);
    return null;
  }
}
