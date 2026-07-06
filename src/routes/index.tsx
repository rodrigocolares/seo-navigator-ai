import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  Gauge,
  ShieldCheck,
  Sparkles,
  LineChart,
  Search,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setChecking(true);
    const { data } = await supabase.auth.getSession();
    // Preserve the URL through the auth flow
    sessionStorage.setItem("pendingScanUrl", url.trim());
    if (data.session) {
      navigate({ to: "/dashboard" });
    } else {
      navigate({ to: "/auth" });
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        {/* Hero */}
        <section className="pt-16 text-center sm:pt-24">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Auditoria SEO com IA — parecer executivo em minutos
          </div>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold leading-tight sm:text-6xl">
            Descubra o que <span className="gradient-text">impede seu site</span> de rankear
            no Google
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Cole a URL do seu site. Nosso crawler percorre suas páginas, avalia SEO técnico,
            performance, conteúdo e indexação — e a IA gera um plano de ação priorizado.
          </p>

          <form
            onSubmit={handleAnalyze}
            className="mx-auto mt-10 flex max-w-2xl flex-col gap-2 sm:flex-row"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                placeholder="https://empresa.com.br"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-14 rounded-xl border-border/60 bg-card/60 pl-12 pr-4 text-base"
                required
              />
            </div>
            <Button type="submit" size="lg" className="h-14 rounded-xl px-8 text-base" disabled={checking}>
              Analisar Site <ArrowRight className="ml-1 h-5 w-5" />
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Grátis para começar. É preciso criar uma conta para salvar o histórico.
          </p>
        </section>

        {/* Feature grid */}
        <section className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass-card rounded-2xl p-6 transition hover:border-primary/40"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* Score preview mock */}
        <section className="mt-24 glass-card rounded-3xl p-8 sm:p-12">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold">Score geral, categoria por categoria</h2>
              <p className="mt-3 text-muted-foreground">
                SEO, Performance, Indexação, Conteúdo, UX, Mobile, Acessibilidade e Segurança.
                Cada problema vem com criticidade, impacto e tempo estimado de correção.
              </p>
              <ul className="mt-6 space-y-2 text-sm">
                {["Criticidade Alta / Média / Baixa", "Roadmap semanal automático", "Comparação entre análises", "Exportação de relatório"].map(
                  (i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {i}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {MOCK_SCORES.map((s) => (
                <div key={s.label} className="rounded-xl border border-border/60 bg-card/60 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </div>
                  <div
                    className="mt-1 text-3xl font-bold"
                    style={{ color: `oklch(${scoreColor(s.value)})` }}
                  >
                    {s.value}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.value}%`,
                        background: `oklch(${scoreColor(s.value)})`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const FEATURES = [
  { icon: Search, title: "Crawler inteligente", desc: "Percorre sitemap, robots.txt e links internos, respeitando limites e evitando áreas restritas." },
  { icon: Gauge, title: "Análise técnica completa", desc: "HTTP, HTTPS, headings, meta tags, canonical, schema, imagens, links e Core Web Vitals." },
  { icon: Sparkles, title: "Parecer executivo com IA", desc: "Explicação clara dos 10 problemas mais críticos e do que trará maior ganho de tráfego." },
  { icon: ShieldCheck, title: "Segurança & indexação", desc: "HSTS, CSP, robots, noindex, canonicals — tudo verificado automaticamente." },
  { icon: LineChart, title: "Histórico e evolução", desc: "Compare análises ao longo do tempo e acompanhe o progresso do site." },
  { icon: Zap, title: "Plano de ação priorizado", desc: "Roadmap por semana com impacto, dificuldade e tempo estimado por tarefa." },
];

const MOCK_SCORES = [
  { label: "SEO", value: 87 },
  { label: "Performance", value: 71 },
  { label: "Indexação", value: 65 },
  { label: "Conteúdo", value: 82 },
];

function scoreColor(v: number) {
  if (v >= 80) return "0.75 0.16 155"; // green
  if (v >= 60) return "0.78 0.16 75"; // amber
  return "0.65 0.22 25"; // red
}
