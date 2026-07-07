import { encryptToken, decryptToken } from "./google-crypto.server";

export const GOOGLE_SCOPES = {
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  identity: "openid email profile",
} as const;

export type GoogleProvider = "gsc" | "ga4" | "both";

export function scopesFor(provider: GoogleProvider): string {
  const parts: string[] = [GOOGLE_SCOPES.identity];
  if (provider === "gsc" || provider === "both") parts.push(GOOGLE_SCOPES.gsc);
  if (provider === "ga4" || provider === "both") parts.push(GOOGLE_SCOPES.ga4);
  return parts.join(" ");
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
  loginHint?: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: params.scopes,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: params.state,
  });
  if (params.loginHint) q.set("login_hint", params.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed [${res.status}]: ${body}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token refresh failed [${res.status}]: ${body}`);
  }
  return res.json();
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{ email: string; sub: string }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed [${res.status}]`);
  const data = (await res.json()) as { email: string; sub: string };
  return { email: data.email, sub: data.sub };
}

/** Get a fresh access token from a stored connection row (refreshing if needed). */
export async function getFreshAccessToken(row: {
  id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_iv: string;
  refresh_iv: string | null;
  expires_at: string;
}): Promise<{ accessToken: string; refreshedTokens?: GoogleTokenResponse }> {
  const expiresAt = new Date(row.expires_at).getTime();
  const needsRefresh = expiresAt - Date.now() < 60_000;
  if (!needsRefresh) {
    return { accessToken: decryptToken(row.access_token_encrypted, row.token_iv) };
  }
  if (!row.refresh_token_encrypted || !row.refresh_iv) {
    throw new Error("Google access token expired and no refresh_token stored. Reconnect required.");
  }
  const refreshToken = decryptToken(row.refresh_token_encrypted, row.refresh_iv);
  const refreshed = await refreshAccessToken(refreshToken);
  return { accessToken: refreshed.access_token, refreshedTokens: refreshed };
}

export { encryptToken, decryptToken };
