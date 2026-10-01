import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Two-factor login (Phase 13): TOTP per RFC 6238 (HMAC-SHA1, 30 s steps, 6 digits) — what every
// authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) expects. Pure functions
// plus AES-256-GCM for storing secrets; no third-party crypto.

export const STEP_SECONDS = 30;
export const DIGITS = 6;
/** Accept the previous and next step too, for phones whose clock is a little off. */
export const WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 random bytes, the RFC 4226 recommended secret length. */
export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * Checks a code and returns the time step it matched (or null). The caller rejects a step that is
 * not newer than the last one used, so an intercepted code can't be replayed.
 */
export function verifyTotp(secretB32: string, code: string, now: Date = new Date(), lastStep: number | null = null): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretB32);
  const current = stepAt(now);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const step = current + d;
    if (lastStep != null && step <= lastStep) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

/** otpauth:// link for authenticator apps (also rendered as a QR code). */
export function otpauthUri(secretB32: string, account: string, issuer = "Go Big"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ─── Storage encryption (AES-256-GCM) ───────────────────────────────────────────────────────

function key(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOTP_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptSecret(secretB32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secretB32, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

// ─── Recovery codes ─────────────────────────────────────────────────────────────────────────

export const RECOVERY_CODE_COUNT = 8;

/** "k7qm-2xr9": 8 base32 characters (40 bits), easy to type from paper. */
export function newRecoveryCodes(n = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(5)).toLowerCase();
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  });
}

export function normalizeRecoveryCode(code: string): string | null {
  const c = code.trim().toLowerCase().replace(/[\s-]/g, "");
  return /^[a-z2-7]{8}$/.test(c) ? `${c.slice(0, 4)}-${c.slice(4)}` : null;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(`gobig-recovery|${code}`).digest("hex");
}
