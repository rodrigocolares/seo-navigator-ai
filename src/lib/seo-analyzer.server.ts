// Server-only crawler & analyzer for SEO Insight AI.
// Runs inside a server function handler. Uses fetch + lightweight HTML parsing.

interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  bytes: number;
  responseMs: number;
  html: string;
  finalUrl: string;
}

async function fetchPage(url: string, timeoutMs = 12000): Promise<FetchedPage | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SEOInsightAI/1.0; +https://seo-insight.ai/bot)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = res.headers.get("content-type") || "";
    const html = contentType.includes("text/html") ? await res.text() : "";
    return {
      url,
      finalUrl: res.url,
      status: res.status,
      contentType,
      bytes: html.length,
      responseMs: Date.now() - started,
      html,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---- HTML parsing helpers (regex-based, worker-safe) ----

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

function findAll(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[0]);
  return out;
}

function textOf(inner: string): string {
  return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export interface PageAnalysis {
  url: string;
  status: number;
  responseMs: number;
  bytes: number;
  contentType: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  lang: string | null;
  viewport: string | null;
  h1Count: number;
  h2Count: number;
  wordCount: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  linksInternal: number;
  linksExternal: number;
  hasOg: boolean;
  hasSchema: boolean;
  isHttps: boolean;
  headings: { h1: string[]; h2: string[] };
  links: string[]; // absolute URLs discovered
  issues: RawIssue[];
}

export interface RawIssue {
  category: string;
  severity: "low" | "medium" | "high";
  title: string;
  description?: string;
  recommendation?: string;
  impact?: string;
  effort?: string;
}

function analyzeHtml(page: FetchedPage, host: string): PageAnalysis {
  const html = page.html;
  const finalUrl = new URL(page.finalUrl);

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? textOf(titleMatch[1]) : null;

  // Meta tags
  const metaTags = findAll(html, /<meta\b[^>]*>/gi);
  let description: string | null = null;
  let robots: string | null = null;
  let viewport: string | null = null;
  let hasOg = false;
  for (const m of metaTags) {
    const nm = (attr(m, "name") || "").toLowerCase();
    const prop = (attr(m, "property") || "").toLowerCase();
    const content = attr(m, "content");
    if (nm === "description") description = content;
    else if (nm === "robots") robots = content;
    else if (nm === "viewport") viewport = content;
    else if (prop.startsWith("og:")) hasOg = true;
  }

  // Canonical
  const canonMatch = findAll(html, /<link\b[^>]*>/gi).find(
    (t) => (attr(t, "rel") || "").toLowerCase() === "canonical",
  );
  const canonical = canonMatch ? attr(canonMatch, "href") : null;

  // Lang
  const htmlTag = html.match(/<html\b[^>]*>/i);
  const lang = htmlTag ? attr(htmlTag[0], "lang") : null;

  // Headings
  const h1s = findAll(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi).map((t) =>
    textOf(t.replace(/<\/?h1[^>]*>/gi, "")),
  );
  const h2s = findAll(html, /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi).map((t) =>
    textOf(t.replace(/<\/?h2[^>]*>/gi, "")),
  );

  // Images
  const imgs = findAll(html, /<img\b[^>]*>/gi);
  let missingAlt = 0;
  for (const t of imgs) {
    const a = attr(t, "alt");
    if (a === null || a.trim() === "") missingAlt++;
  }

  // Links
  const anchorTags = findAll(html, /<a\b[^>]*>/gi);
  const links: string[] = [];
  let internal = 0;
  let external = 0;
  for (const t of anchorTags) {
    const href = attr(t, "href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    try {
      const abs = new URL(href, page.finalUrl).toString();
      const u = new URL(abs);
      if (u.hostname === host) {
        internal++;
        links.push(abs);
      } else {
        external++;
      }
    } catch {
      /* ignore */
    }
  }

  // Schema JSON-LD
  const hasSchema = /<script[^>]+application\/ld\+json[^>]*>/i.test(html);

  // Word count (body-ish)
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodyText = textOf((bodyMatch ? bodyMatch[1] : html).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, ""));
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

  const isHttps = finalUrl.protocol === "https:";

  // Compute issues
  const issues: RawIssue[] = [];
  const push = (i: RawIssue) => issues.push(i);

  if (page.status >= 400) {
    push({
      category: "HTTP",
      severity: "high",
      title: `Página retorna status ${page.status}`,
      description: `${page.url} respondeu com código HTTP ${page.status}.`,
      recommendation: "Corrija o erro, ajuste redirects ou remova o link para essa URL.",
      impact: "alto",
      effort: "Média",
    });
  }
  if (!isHttps) {
    push({
      category: "Segurança",
      severity: "high",
      title: "Página servida sem HTTPS",
      recommendation: "Force HTTPS e adicione HSTS.",
      impact: "alto",
      effort: "Média",
    });
  }
  if (!title) {
    push({ category: "SEO", severity: "high", title: "Página sem <title>", recommendation: "Defina um title único de 50–60 caracteres.", impact: "alto", effort: "Fácil" });
  } else if (title.length < 20 || title.length > 65) {
    push({
      category: "SEO",
      severity: "medium",
      title: `Title com tamanho inadequado (${title.length} caracteres)`,
      recommendation: "Reescreva com 50–60 caracteres focando na palavra-chave principal.",
      impact: "médio",
      effort: "Fácil",
    });
  }
  if (!description) {
    push({ category: "SEO", severity: "high", title: "Meta description ausente", recommendation: "Adicione descrição de 140–160 caracteres.", impact: "alto", effort: "Fácil" });
  } else if (description.length < 80 || description.length > 170) {
    push({
      category: "SEO",
      severity: "low",
      title: `Meta description fora do ideal (${description.length} caracteres)`,
      recommendation: "Reescreva entre 140–160 caracteres.",
      impact: "baixo",
      effort: "Fácil",
    });
  }
  if (h1s.length === 0) push({ category: "Conteúdo", severity: "high", title: "Página sem H1", recommendation: "Inclua exatamente um H1 descritivo.", impact: "alto", effort: "Fácil" });
  else if (h1s.length > 1) push({ category: "Conteúdo", severity: "medium", title: `${h1s.length} H1s na mesma página`, recommendation: "Mantenha um único H1 por página.", impact: "médio", effort: "Fácil" });

  if (imgs.length > 0 && missingAlt > 0) {
    push({
      category: "Acessibilidade",
      severity: missingAlt > 5 ? "high" : "medium",
      title: `${missingAlt} imagem(ns) sem atributo ALT`,
      recommendation: "Adicione descrições ALT nas imagens (SEO + acessibilidade).",
      impact: "médio",
      effort: "Fácil",
    });
  }

  if (!canonical) {
    push({ category: "SEO", severity: "medium", title: "Sem <link rel='canonical'>", recommendation: "Defina a URL canônica da página.", impact: "médio", effort: "Fácil" });
  }
  if (!viewport) {
    push({ category: "Mobile", severity: "high", title: "Meta viewport ausente", recommendation: "Adicione <meta name='viewport' content='width=device-width, initial-scale=1'>.", impact: "alto", effort: "Fácil" });
  }
  if (!lang) {
    push({ category: "SEO", severity: "low", title: "Atributo lang ausente no <html>", recommendation: "Defina lang='pt-BR' (ou idioma correto).", impact: "baixo", effort: "Fácil" });
  }
  if (!hasOg) {
    push({ category: "Social", severity: "low", title: "Sem Open Graph tags", recommendation: "Adicione og:title, og:description, og:image para compartilhamento.", impact: "baixo", effort: "Fácil" });
  }
  if (!hasSchema) {
    push({ category: "SEO", severity: "low", title: "Sem dados estruturados (JSON-LD)", recommendation: "Adicione Schema.org relevante (Organization, Article, Product...).", impact: "médio", effort: "Média" });
  }
  if (wordCount < 250 && page.status === 200) {
    push({ category: "Conteúdo", severity: "medium", title: `Thin content (${wordCount} palavras)`, recommendation: "Amplie o conteúdo com informação relevante e original.", impact: "médio", effort: "Média" });
  }
  if (page.responseMs > 2500) {
    push({ category: "Performance", severity: "high", title: `Tempo de resposta lento (${page.responseMs}ms)`, recommendation: "Otimize TTFB, cache no servidor e CDN.", impact: "alto", effort: "Média" });
  } else if (page.responseMs > 1200) {
    push({ category: "Performance", severity: "medium", title: `Tempo de resposta acima do ideal (${page.responseMs}ms)`, recommendation: "Melhore cache e reduza processamento no servidor.", impact: "médio", effort: "Média" });
  }
  if (page.bytes > 1_500_000) {
    push({ category: "Performance", severity: "medium", title: `HTML pesado (${Math.round(page.bytes / 1024)} KB)`, recommendation: "Minifique, remova código inline e adote lazy loading.", impact: "médio", effort: "Média" });
  }

  return {
    url: page.finalUrl,
    status: page.status,
    responseMs: page.responseMs,
    bytes: page.bytes,
    contentType: page.contentType,
    title,
    metaDescription: description,
    canonical,
    robotsMeta: robots,
    lang,
    viewport,
    h1Count: h1s.length,
    h2Count: h2s.length,
    wordCount,
    imagesTotal: imgs.length,
    imagesMissingAlt: missingAlt,
    linksInternal: internal,
    linksExternal: external,
    hasOg,
    hasSchema,
    isHttps,
    headings: { h1: h1s.slice(0, 5), h2: h2s.slice(0, 10) },
    links,
    issues,
  };
}

// ---- Crawl ----

export interface CrawlResult {
  pages: PageAnalysis[];
  robotsTxtFound: boolean;
  sitemapFound: boolean;
  siteIssues: RawIssue[];
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    // Skip common junk
    return url.toString();
  } catch {
    return u;
  }
}

function shouldSkip(url: string): boolean {
  return /\/(wp-admin|admin|login|logout|signout|signin|painel|dashboard-admin|cart|checkout|carrinho)(\/|$|\?)/i.test(url)
    || /\.(pdf|zip|rar|jpg|jpeg|png|gif|svg|webp|avif|mp4|mp3|css|js|xml)($|\?)/i.test(url);
}

export async function crawlSite(startUrl: string, maxPages: number): Promise<CrawlResult> {
  const start = new URL(startUrl);
  const host = start.hostname;
  const siteIssues: RawIssue[] = [];

  // Robots + sitemap discovery
  const [robotsRes, sitemapRes] = await Promise.all([
    fetchPage(`${start.origin}/robots.txt`, 6000),
    fetchPage(`${start.origin}/sitemap.xml`, 6000),
  ]);
  const robotsTxtFound = !!robotsRes && robotsRes.status === 200;
  const sitemapFound = !!sitemapRes && sitemapRes.status === 200;

  if (!robotsTxtFound)
    siteIssues.push({ category: "Indexação", severity: "medium", title: "robots.txt não encontrado", recommendation: "Publique /robots.txt (mesmo que permitindo tudo).", impact: "médio", effort: "Fácil" });
  if (!sitemapFound)
    siteIssues.push({ category: "Indexação", severity: "high", title: "sitemap.xml não encontrado", recommendation: "Gere e publique /sitemap.xml.", impact: "alto", effort: "Média" });

  // Seed queue with startUrl + up to 10 sitemap URLs
  const queue: string[] = [normalizeUrl(startUrl)];
  const seen = new Set<string>();

  if (sitemapRes && sitemapRes.html) {
    const locs = findAll(sitemapRes.html, /<loc>([^<]+)<\/loc>/gi)
      .map((t) => t.replace(/<\/?loc>/gi, "").trim())
      .filter((u) => {
        try {
          return new URL(u).hostname === host;
        } catch {
          return false;
        }
      })
      .slice(0, Math.max(0, maxPages - 1));
    for (const u of locs) queue.push(normalizeUrl(u));
  }

  const pages: PageAnalysis[] = [];
  const concurrency = 4;

  async function worker() {
    while (pages.length < maxPages) {
      const next = queue.shift();
      if (!next) return;
      if (seen.has(next)) continue;
      seen.add(next);
      if (shouldSkip(next)) continue;

      const fetched = await fetchPage(next);
      if (!fetched) continue;
      const analysis = analyzeHtml(fetched, host);
      pages.push(analysis);

      // enqueue up to a few new internal links per page
      for (const link of analysis.links) {
        if (pages.length + queue.length >= maxPages) break;
        const n = normalizeUrl(link);
        if (!seen.has(n) && !shouldSkip(n)) queue.push(n);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return { pages, robotsTxtFound, sitemapFound, siteIssues };
}

// ---- Scoring ----

export interface CategoryScores {
  seo: number;
  performance: number;
  content: number;
  accessibility: number;
  mobile: number;
  security: number;
  indexation: number;
  overall: number;
}

export function computeScores(result: CrawlResult): CategoryScores {
  if (result.pages.length === 0) {
    return { seo: 0, performance: 0, content: 0, accessibility: 0, mobile: 0, security: 0, indexation: 0, overall: 0 };
  }
  const allIssues = [
    ...result.siteIssues,
    ...result.pages.flatMap((p) => p.issues),
  ];
  const weight = (s: RawIssue["severity"]) => (s === "high" ? 15 : s === "medium" ? 7 : 3);

  const byCategory = (cats: string[]) => {
    const relevant = allIssues.filter((i) => cats.includes(i.category));
    const penalty = relevant.reduce((sum, i) => sum + weight(i.severity), 0);
    return clamp(100 - penalty / Math.max(1, result.pages.length));
  };

  const scores = {
    seo: byCategory(["SEO", "Social"]),
    performance: byCategory(["Performance"]),
    content: byCategory(["Conteúdo"]),
    accessibility: byCategory(["Acessibilidade"]),
    mobile: byCategory(["Mobile"]),
    security: byCategory(["Segurança"]),
    indexation: byCategory(["Indexação", "HTTP"]),
    overall: 0,
  };
  scores.overall = Math.round(
    (scores.seo + scores.performance + scores.content + scores.accessibility + scores.mobile + scores.security + scores.indexation) / 7,
  );
  return scores;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ---- AI report ----

export interface AIReport {
  executive_summary: string;
  top_issues: { title: string; severity: string; why_it_matters: string; how_to_fix: string }[];
  quick_wins: string[];
  roadmap: { week: string; tasks: string[] }[];
  seo_recommendations: string[];
  ux_recommendations: string[];
}

export async function generateAIReport(
  url: string,
  scores: CategoryScores,
  crawl: CrawlResult,
): Promise<AIReport | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[SEO] LOVABLE_API_KEY missing — skipping AI report");
    return null;
  }

  const allIssues = [
    ...crawl.siteIssues,
    ...crawl.pages.flatMap((p) =>
      p.issues.map((i) => ({ ...i, url: p.url })),
    ),
  ];
  const highs = allIssues.filter((i) => i.severity === "high").slice(0, 20);
  const meds = allIssues.filter((i) => i.severity === "medium").slice(0, 15);

  const facts = {
    url,
    pages_crawled: crawl.pages.length,
    robots_txt: crawl.robotsTxtFound,
    sitemap_xml: crawl.sitemapFound,
    scores,
    high_severity: highs,
    medium_severity: meds,
    sample_pages: crawl.pages.slice(0, 5).map((p) => ({
      url: p.url,
      title: p.title,
      status: p.status,
      response_ms: p.responseMs,
      words: p.wordCount,
    })),
  };

  const prompt = `Você é um especialista em SEO. Com base nos DADOS TÉCNICOS abaixo, produza um parecer executivo em PORTUGUÊS DO BRASIL.

RESPONDA APENAS COM JSON VÁLIDO no formato:
{
  "executive_summary": "string (2-3 parágrafos, tom executivo)",
  "top_issues": [{"title":"...","severity":"alta|média|baixa","why_it_matters":"...","how_to_fix":"..."}],
  "quick_wins": ["ação1", "ação2", ...],
  "roadmap": [{"week":"Semana 1","tasks":["tarefa1","tarefa2"]}, ...],
  "seo_recommendations": ["...", "..."],
  "ux_recommendations": ["...", "..."]
}

Regras:
- top_issues: exatamente 10 itens ordenados por impacto.
- roadmap: 3 semanas com 3-5 tarefas cada.
- Linguagem clara, sem jargão. Explique impacto no ranqueamento do Google.

DADOS:
${JSON.stringify(facts, null, 2)}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert SEO consultant. Always answer with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[SEO] AI gateway error", res.status, body);
      return null;
    }
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as AIReport;
  } catch (err) {
    console.error("[SEO] AI report failed", err);
    return null;
  }
}
