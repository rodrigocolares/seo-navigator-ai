import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY not configured");
  // Derive a stable 32-byte key from whatever length the secret is
  return createHash("sha256").update(raw).digest();
}

/** Encrypt a string with AES-256-GCM. Returns { data, iv } as base64. */
export function encryptToken(plaintext: string): { data: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store ciphertext + tag together, base64
  const combined = Buffer.concat([enc, tag]);
  return { data: combined.toString("base64"), iv: iv.toString("base64") };
}

export function decryptToken(data: string, iv: string): string {
  const combined = Buffer.from(data, "base64");
  const tag = combined.subarray(combined.length - 16);
  const enc = combined.subarray(0, combined.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/** Sign an OAuth state payload. Returns `<payload_b64>.<hmac_b64>`. */
export function signState(payload: object): string {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("GOOGLE_OAUTH_STATE_SECRET not configured");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState<T = Record<string, unknown>>(state: string, maxAgeMs = 10 * 60 * 1000): T {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("GOOGLE_OAUTH_STATE_SECRET not configured");
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Invalid state");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid state signature");
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { ts?: number };
  if (!parsed.ts || Date.now() - parsed.ts > maxAgeMs) throw new Error("State expired");
  return parsed;
}
