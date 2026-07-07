import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        // Where to send the user afterward
        const appOrigin = (() => {
          const fwdHost = request.headers.get("x-forwarded-host") ?? url.host;
          const fwdProto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
          return `${fwdProto}://${fwdHost}`;
        })();

        const redirectWith = (target: string, params: Record<string, string>) => {
          const to = new URL(target, appOrigin);
          for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
          return Response.redirect(to.toString(), 302);
        };

        if (error) {
          return redirectWith("/integrations", { google_error: error });
        }
        if (!code || !state) {
          return redirectWith("/integrations", { google_error: "missing_code" });
        }

        try {
          const { verifyState } = await import("@/lib/google-crypto.server");
          const { exchangeCodeForTokens, fetchGoogleUserInfo, encryptToken } = await import(
            "@/lib/google-oauth.server"
          );
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const parsed = verifyState<{
            uid: string;
            provider: string;
            returnTo: string;
            redirectUri: string;
          }>(state);

          const tokens = await exchangeCodeForTokens({
            code,
            redirectUri: parsed.redirectUri,
          });
          const userInfo = await fetchGoogleUserInfo(tokens.access_token);

          const accessEnc = encryptToken(tokens.access_token);
          const refreshEnc = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
          const scopes = tokens.scope ? tokens.scope.split(" ") : [];
          const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

          // Upsert connection (uses admin client because callback has no user session)
          const { data: existing } = await supabaseAdmin
            .from("google_connections")
            .select("id, refresh_token_encrypted, refresh_iv")
            .eq("user_id", parsed.uid)
            .eq("google_account_email", userInfo.email)
            .maybeSingle();

          const upsertPayload: Record<string, unknown> = {
            user_id: parsed.uid,
            google_account_email: userInfo.email,
            google_account_sub: userInfo.sub,
            access_token_encrypted: accessEnc.data,
            token_iv: accessEnc.iv,
            scopes,
            expires_at: expiresAt,
            status: "active",
            error_message: null,
          };
          // Preserve prior refresh token if Google didn't return a new one this time
          if (refreshEnc) {
            upsertPayload.refresh_token_encrypted = refreshEnc.data;
            upsertPayload.refresh_iv = refreshEnc.iv;
          } else if (existing?.refresh_token_encrypted) {
            upsertPayload.refresh_token_encrypted = existing.refresh_token_encrypted;
            upsertPayload.refresh_iv = existing.refresh_iv;
          }

          const { error: upsertErr } = await supabaseAdmin
            .from("google_connections")
            .upsert(upsertPayload, { onConflict: "user_id,google_account_email" });

          if (upsertErr) {
            console.error("google_connections upsert error", upsertErr);
            return redirectWith(parsed.returnTo || "/integrations", { google_error: "save_failed" });
          }

          return redirectWith(parsed.returnTo || "/integrations", {
            google_connected: userInfo.email,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Google OAuth callback error:", msg);
          return redirectWith("/integrations", { google_error: "callback_failed" });
        }
      },
    },
  },
});
