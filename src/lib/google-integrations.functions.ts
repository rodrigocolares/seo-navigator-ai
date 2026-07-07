import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerSchema = z.enum(["gsc", "ga4", "both"]);

function resolveRedirectUri(): string {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  const req = getRequest();
  const url = new URL(req.url);
  // Trust forwarded host if present (behind Lovable proxy)
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? url.host;
  const proto = forwardedProto ?? (url.protocol.replace(":", ""));
  return `${proto}://${host}/api/public/google/callback`;
}

export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: "gsc" | "ga4" | "both"; returnTo?: string }) =>
    z.object({ provider: providerSchema, returnTo: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("Google OAuth ainda não configurado. Contate o administrador.");
    const { signState } = await import("./google-crypto.server");
    const { buildAuthUrl, scopesFor } = await import("./google-oauth.server");

    const redirectUri = resolveRedirectUri();
    const state = signState({
      uid: context.userId,
      provider: data.provider,
      returnTo: data.returnTo ?? "/integrations",
      redirectUri,
      ts: Date.now(),
    });
    const url = buildAuthUrl({
      clientId,
      redirectUri,
      scopes: scopesFor(data.provider),
      state,
    });
    return { authUrl: url };
  });

export const listGoogleConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("google_connections")
      .select("id, google_account_email, scopes, status, last_sync_at, error_message, expires_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { connectionId: string }) =>
    z.object({ connectionId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("google_connections")
      .delete()
      .eq("id", data.connectionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Refresh cached lists of GSC sites / GA4 properties for a connection. */
export const refreshGoogleProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { connectionId: string }) =>
    z.object({ connectionId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: conn, error: connErr } = await context.supabase
      .from("google_connections")
      .select("*")
      .eq("id", data.connectionId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("Conexão não encontrada");

    const { getFreshAccessToken, encryptToken } = await import("./google-oauth.server");
    const { listSearchConsoleSites, listAnalyticsProperties } = await import("./google-api.server");

    let accessToken: string;
    try {
      const fresh = await getFreshAccessToken(conn);
      accessToken = fresh.accessToken;
      // Persist refreshed token if applicable
      if (fresh.refreshedTokens) {
        const enc = encryptToken(fresh.refreshedTokens.access_token);
        await context.supabase
          .from("google_connections")
          .update({
            access_token_encrypted: enc.data,
            token_iv: enc.iv,
            expires_at: new Date(Date.now() + fresh.refreshedTokens.expires_in * 1000).toISOString(),
            status: "active",
            error_message: null,
          })
          .eq("id", conn.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao renovar token";
      await context.supabase
        .from("google_connections")
        .update({ status: "error", error_message: msg })
        .eq("id", conn.id);
      throw new Error("Não foi possível autenticar com o Google. Reconecte a conta.");
    }

    const scopes: string[] = conn.scopes ?? [];
    const hasGsc = scopes.some((s) => s.includes("webmasters"));
    const hasGa4 = scopes.some((s) => s.includes("analytics"));

    let sitesCount = 0;
    let propsCount = 0;

    if (hasGsc) {
      try {
        const sites = await listSearchConsoleSites(accessToken);
        // Upsert sites
        if (sites.length) {
          const rows = sites.map((s) => ({
            user_id: context.userId,
            connection_id: conn.id,
            site_url: s.siteUrl,
            permission_level: s.permissionLevel,
          }));
          await context.supabase
            .from("google_search_console_sites")
            .upsert(rows, { onConflict: "connection_id,site_url" });
        }
        sitesCount = sites.length;
      } catch (e) {
        console.error("GSC sync error", e);
      }
    }

    if (hasGa4) {
      try {
        const props = await listAnalyticsProperties(accessToken);
        if (props.length) {
          const rows = props.map((p) => ({
            user_id: context.userId,
            connection_id: conn.id,
            account_id: p.accountId,
            account_name: p.accountName,
            property_id: p.propertyId,
            property_name: p.propertyName,
            display_name: p.displayName,
          }));
          await context.supabase
            .from("google_analytics_properties")
            .upsert(rows, { onConflict: "connection_id,property_id" });
        }
        propsCount = props.length;
      } catch (e) {
        console.error("GA4 sync error", e);
      }
    }

    await context.supabase
      .from("google_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", conn.id);

    return { sitesCount, propsCount };
  });

export const listGoogleSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("google_search_console_sites")
      .select("id, connection_id, site_url, permission_level");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listGoogleProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("google_analytics_properties")
      .select("id, connection_id, property_id, display_name, account_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listUserDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scans")
      .select("url")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const row of data ?? []) {
      try {
        const u = new URL(row.url);
        set.add(`${u.protocol}//${u.host}`);
      } catch {
        /* ignore */
      }
    }
    return Array.from(set);
  });

export const listDomainIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("domain_integrations")
      .select("id, domain, search_console_site_id, ga4_property_id, updated_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertDomainIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    domain: string;
    searchConsoleSiteId: string | null;
    ga4PropertyId: string | null;
  }) =>
    z
      .object({
        domain: z.string().min(1),
        searchConsoleSiteId: z.string().uuid().nullable(),
        ga4PropertyId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("domain_integrations").upsert(
      {
        user_id: context.userId,
        domain: data.domain,
        search_console_site_id: data.searchConsoleSiteId,
        ga4_property_id: data.ga4PropertyId,
      },
      { onConflict: "user_id,domain" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDomainIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("domain_integrations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
