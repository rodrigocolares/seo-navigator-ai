import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  BarChart3,
  Link2,
  Unplug,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Settings2,
  ChevronDown,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listGoogleConnections,
  listGoogleSites,
  listGoogleProperties,
  listUserDomains,
  listDomainIntegrations,
  startGoogleOAuth,
  disconnectGoogle,
  refreshGoogleProperties,
  upsertDomainIntegration,
} from "@/lib/google-integrations.functions";

const search = { google_connected: "string?", google_error: "string?" } as const;

export const Route = createFileRoute("/_authenticated/integrations")({
  validateSearch: (s: Record<string, unknown>) => ({
    google_connected: typeof s.google_connected === "string" ? s.google_connected : undefined,
    google_error: typeof s.google_error === "string" ? s.google_error : undefined,
    google_error_description:
      typeof s.google_error_description === "string" ? s.google_error_description : undefined,
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const qc = useQueryClient();
  const { google_connected, google_error, google_error_description } = Route.useSearch();
  const [lastError, setLastError] = useState<string | null>(null);

  const listConnFn = useServerFn(listGoogleConnections);
  const listSitesFn = useServerFn(listGoogleSites);
  const listPropsFn = useServerFn(listGoogleProperties);
  const listDomainsFn = useServerFn(listUserDomains);
  const listDomainIntFn = useServerFn(listDomainIntegrations);
  const startOAuthFn = useServerFn(startGoogleOAuth);
  const disconnectFn = useServerFn(disconnectGoogle);
  const refreshFn = useServerFn(refreshGoogleProperties);
  const upsertDomainFn = useServerFn(upsertDomainIntegration);

  const { data: connections = [] } = useQuery({ queryKey: ["google-connections"], queryFn: () => listConnFn() });
  const { data: sites = [] } = useQuery({ queryKey: ["google-sites"], queryFn: () => listSitesFn() });
  const { data: properties = [] } = useQuery({ queryKey: ["google-properties"], queryFn: () => listPropsFn() });
  const { data: domains = [] } = useQuery({ queryKey: ["user-domains"], queryFn: () => listDomainsFn() });
  const { data: domainInt = [] } = useQuery({
    queryKey: ["domain-integrations"],
    queryFn: () => listDomainIntFn(),
  });

  useEffect(() => {
    if (google_connected) toast.success(`Google conectado: ${google_connected}`);
    if (google_error) {
      const messages: Record<string, string> = {
        access_denied: "Permissão negada pelo usuário no Google.",
        missing_code: "Retorno do Google incompleto. Tente novamente.",
        save_failed: "Não foi possível salvar a conexão. Tente novamente.",
        callback_failed: "Falha no retorno do Google. Verifique as configurações OAuth.",
        redirect_uri_mismatch:
          "As credenciais OAuth do Google ainda não possuem a URL deste ambiente cadastrada. Verifique as Redirect URIs autorizadas no Google Cloud (veja o painel de diagnóstico abaixo).",
        invalid_client: "Client ID/Secret inválido no Google Cloud. Revise as credenciais OAuth.",
      };
      toast.error(messages[google_error] ?? `Erro na conexão: ${google_error}`);
      setLastError(
        google_error_description ? `${google_error}: ${google_error_description}` : google_error,
      );
    }
    if (google_connected || google_error) {
      qc.invalidateQueries({ queryKey: ["google-connections"] });
      window.history.replaceState({}, "", "/integrations");
    }
  }, [google_connected, google_error, google_error_description, qc]);

  const gscConn = useMemo(
    () => connections.find((c) => c.scopes?.some((s: string) => s.includes("webmasters"))),
    [connections],
  );
  const ga4Conn = useMemo(
    () => connections.find((c) => c.scopes?.some((s: string) => s.includes("analytics"))),
    [connections],
  );

  const connectMutation = useMutation({
    mutationFn: async (provider: "gsc" | "ga4" | "both") =>
      startOAuthFn({ data: { provider, returnTo: "/integrations" } }),
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (connectionId: string) => disconnectFn({ data: { connectionId } }),
    onSuccess: () => {
      toast.success("Integração desconectada");
      qc.invalidateQueries({ queryKey: ["google-connections"] });
      qc.invalidateQueries({ queryKey: ["google-sites"] });
      qc.invalidateQueries({ queryKey: ["google-properties"] });
      qc.invalidateQueries({ queryKey: ["domain-integrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMutation = useMutation({
    mutationFn: async (connectionId: string) => refreshFn({ data: { connectionId } }),
    onSuccess: (res) => {
      toast.success(`Sincronizado: ${res.sitesCount} sites GSC, ${res.propsCount} propriedades GA4`);
      qc.invalidateQueries({ queryKey: ["google-connections"] });
      qc.invalidateQueries({ queryKey: ["google-sites"] });
      qc.invalidateQueries({ queryKey: ["google-properties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkMutation = useMutation({
    mutationFn: async (input: {
      domain: string;
      searchConsoleSiteId: string | null;
      ga4PropertyId: string | null;
    }) => upsertDomainFn({ data: input }),
    onSuccess: () => {
      toast.success("Vínculo salvo");
      qc.invalidateQueries({ queryKey: ["domain-integrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Integrações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte suas contas Google para enriquecer as análises com dados reais de indexação e tráfego.
        </p>
      </div>

      <OAuthSetupHelp lastError={lastError} />



      <div className="grid gap-4 md:grid-cols-2">
        <IntegrationCard
          icon={<Search className="h-5 w-5" />}
          title="Google Search Console"
          description="Cliques, impressões, CTR, posição, consultas e páginas indexadas."
          connection={gscConn}
          countLabel={gscConn ? `${sites.length} propriedade${sites.length === 1 ? "" : "s"}` : undefined}
          onConnect={() => connectMutation.mutate("gsc")}
          onDisconnect={(id) => disconnectMutation.mutate(id)}
          onRefresh={(id) => refreshMutation.mutate(id)}
          isConnecting={connectMutation.isPending && connectMutation.variables === "gsc"}
          isRefreshing={refreshMutation.isPending}
        />

        <IntegrationCard
          icon={<BarChart3 className="h-5 w-5" />}
          title="Google Analytics 4"
          description="Sessões, usuários, engajamento, conversões e landing pages."
          connection={ga4Conn}
          countLabel={ga4Conn ? `${properties.length} propriedade${properties.length === 1 ? "" : "s"}` : undefined}
          onConnect={() => connectMutation.mutate("ga4")}
          onDisconnect={(id) => disconnectMutation.mutate(id)}
          onRefresh={(id) => refreshMutation.mutate(id)}
          isConnecting={connectMutation.isPending && connectMutation.variables === "ga4"}
          isRefreshing={refreshMutation.isPending}
        />
      </div>

      {(!gscConn || !ga4Conn) && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border/60 bg-card/40 p-4">
          <div>
            <p className="text-sm font-medium">Conectar ambos de uma vez</p>
            <p className="text-xs text-muted-foreground">
              Autorize Search Console + Analytics em um único consentimento.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => connectMutation.mutate("both")}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending && connectMutation.variables === "both" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Conectar ambos
          </Button>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Vincular domínios às propriedades Google</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha qual propriedade GSC e qual propriedade GA4 alimentam cada domínio analisado.
        </p>

        {domains.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Rode uma análise no dashboard para começar a vincular domínios.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {domains.map((domain) => {
              const link = domainInt.find((d) => d.domain === domain);
              return (
                <DomainRow
                  key={domain}
                  domain={domain}
                  currentSite={link?.search_console_site_id ?? null}
                  currentProp={link?.ga4_property_id ?? null}
                  sites={sites}
                  properties={properties}
                  onSave={(searchConsoleSiteId, ga4PropertyId) =>
                    linkMutation.mutate({ domain, searchConsoleSiteId, ga4PropertyId })
                  }
                  saving={linkMutation.isPending}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function IntegrationCard(props: {
  icon: React.ReactNode;
  title: string;
  description: string;
  connection?: {
    id: string;
    google_account_email: string;
    status: string;
    last_sync_at: string | null;
    error_message: string | null;
  };
  countLabel?: string;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  onRefresh: (id: string) => void;
  isConnecting: boolean;
  isRefreshing: boolean;
}) {
  const { connection } = props;
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
            {props.icon}
          </div>
          <div>
            <h3 className="font-semibold">{props.title}</h3>
            <p className="text-xs text-muted-foreground">{props.description}</p>
          </div>
        </div>
        <StatusBadge status={connection?.status} error={!!connection?.error_message} />
      </div>

      {connection ? (
        <div className="mt-4 space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Conta:</span> {connection.google_account_email}
          </p>
          {props.countLabel && (
            <p>
              <span className="text-muted-foreground">Propriedades:</span> {props.countLabel}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">Última sinc:</span>{" "}
            {connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString("pt-BR") : "nunca"}
          </p>
          {connection.error_message && (
            <p className="text-destructive">Erro: {connection.error_message}</p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Não conectado.</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {connection ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => props.onRefresh(connection.id)}
              disabled={props.isRefreshing}
            >
              {props.isRefreshing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Sincronizar agora
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("Desconectar esta integração?")) props.onDisconnect(connection.id);
              }}
            >
              <Unplug className="mr-1.5 h-4 w-4" /> Desconectar
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={props.onConnect} disabled={props.isConnecting}>
            {props.isConnecting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-1.5 h-4 w-4" />
            )}
            Conectar
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, error }: { status?: string; error?: boolean }) {
  if (!status) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Não conectado</span>
    );
  }
  if (error || status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" /> Erro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Conectado
    </span>
  );
}

function DomainRow(props: {
  domain: string;
  currentSite: string | null;
  currentProp: string | null;
  sites: Array<{ id: string; site_url: string }>;
  properties: Array<{ id: string; display_name: string | null; account_name: string | null }>;
  onSave: (siteId: string | null, propId: string | null) => void;
  saving: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-border/60 bg-card/30 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
      <div className="text-sm font-medium">{props.domain}</div>
      <Select
        value={props.currentSite ?? "none"}
        onValueChange={(v) => props.onSave(v === "none" ? null : v, props.currentProp)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Site GSC" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Nenhum —</SelectItem>
          {props.sites.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.site_url}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={props.currentProp ?? "none"}
        onValueChange={(v) => props.onSave(props.currentSite, v === "none" ? null : v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Propriedade GA4" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Nenhuma —</SelectItem>
          {props.properties.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.display_name || p.account_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="text-xs text-muted-foreground">{props.saving ? "Salvando…" : "Auto-salva"}</div>
    </div>
  );
}
