import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Phase 16: encryption at rest for sensitive fields (exact trip coordinates, recipient phone numbers).
// AES-256-GCM; each value carries the id of the key that sealed it, so the key can be rotated:
// set the new key as DATA_ENCRYPTION_KEY and the old one as DATA_ENCRYPTION_KEY_PREVIOUS, and both
// read while new writes use the new key. Keys are 32 random bytes, base64
// (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

export class EncryptionUnavailableError extends Error {
  constructor() {
    super("DATA_ENCRYPTION_KEY is not set or is not 32 bytes (base64)");
  }
}

type Key = { id: string; key: Buffer };

function parse(raw: string | undefined): Key | null {
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) return null;
  // A short public fingerprint identifies the key without revealing it.
  return { id: createHash("sha256").update(key).digest("hex").slice(0, 8), key };
}

function keys(): { current: Key; all: Key[] } {
  const current = parse(process.env.DATA_ENCRYPTION_KEY);
  if (!current) throw new EncryptionUnavailableError();
  const previous = parse(process.env.DATA_ENCRYPTION_KEY_PREVIOUS);
  return { current, all: previous ? [current, previous] : [current] };
}

/** True when sensitive-data features (rides, deliveries) can store data. */
export function encryptionConfigured(): boolean {
  try {
    keys();
    return true;
  } catch {
    return false;
  }
}

/** `purpose` is bound into the ciphertext, so a value sealed as one field can't be replayed as another. */
export function seal(plain: string, purpose: string): string {
  const { current } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["e1", current.id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string, purpose: string): string {
  const [v, kid, iv, tag, data] = sealed.split(".");
  if (v !== "e1" || !kid || !iv || !tag || data == null) throw new Error("unknown sealed format");
  const k = keys().all.find((x) => x.id === kid);
  if (!k) throw new Error("sealed with a key that is no longer configured");
  const decipher = createDecipheriv("aes-256-gcm", k.key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export type Point = { lat: number; lng: number };

export function sealPoint(p: Point, purpose: string): string {
  return seal(`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`, purpose);
}

export function openPoint(sealed: string, purpose: string): Point {
  const [lat, lng] = open(sealed, purpose).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("bad sealed point");
  return { lat: lat!, lng: lng! };
}
