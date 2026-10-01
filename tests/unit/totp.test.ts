import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  hotp,
  newRecoveryCodes,
  newSecret,
  normalizeRecoveryCode,
  otpauthUri,
  stepAt,
  verifyTotp,
} from "@/lib/totp";
import { can } from "@/lib/permissions";
import { mfaSatisfied } from "@/lib/services/twoFactor";

beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
});

// RFC 6238 appendix B, SHA-1 seed "12345678901234567890". The RFC lists 8-digit codes; a 6-digit
// code is the same value mod 10^6 (its last six digits).
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

describe("TOTP matches the RFC 6238 test vectors", () => {
  it.each(RFC_VECTORS)("t=%i → %s", (t, expected) => {
    expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(expected);
    expect(hotp(RFC_SECRET, Math.floor(t / 30), 6)).toBe(expected.slice(2));
  });
});

describe("codes", () => {
  const secret = base32Encode(RFC_SECRET);
  const at = new Date(1111111111 * 1000);

  it("base32 round-trips", () => {
    expect(base32Decode(secret).equals(RFC_SECRET)).toBe(true);
    const s = newSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
  });

  it("accepts the current code and one step either side, nothing further", () => {
    const step = stepAt(at);
    const code = (d: number) => hotp(RFC_SECRET, step + d);
    expect(verifyTotp(secret, code(0), at)).toBe(step);
    expect(verifyTotp(secret, code(-1), at)).toBe(step - 1);
    expect(verifyTotp(secret, code(1), at)).toBe(step + 1);
    expect(verifyTotp(secret, code(2), at)).toBeNull();
    expect(verifyTotp(secret, "12345", at)).toBeNull();
    expect(verifyTotp(secret, "abcdef", at)).toBeNull();
  });

  it("a code can't be replayed once its step has been used", () => {
    const step = stepAt(at);
    expect(verifyTotp(secret, hotp(RFC_SECRET, step), at, step)).toBeNull();
    expect(verifyTotp(secret, hotp(RFC_SECRET, step - 1), at, step)).toBeNull();
    expect(verifyTotp(secret, hotp(RFC_SECRET, step + 1), at, step)).toBe(step + 1);
  });

  it("otpauth links carry issuer, account and parameters", () => {
    const uri = otpauthUri(secret, "admin@gobig.co.tz");
    expect(uri).toContain("otpauth://totp/GO%20BIG%3Aadmin%40gobig.co.tz?");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("digits=6&period=30");
  });
});

describe("secret storage", () => {
  it("encrypts with a fresh IV each time and detects tampering", () => {
    const s = newSecret();
    const a = encryptSecret(s);
    const b = encryptSecret(s);
    expect(a).not.toBe(b);
    expect(a).not.toContain(s);
    expect(decryptSecret(a)).toBe(s);
    const [v, iv, tag, data] = a.split(".");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });
});

describe("recovery codes", () => {
  it("are random, readable and normalised however they're typed", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(normalizeRecoveryCode(" K7QM 2XR6 ")).toBe("k7qm-2xr6");
    expect(normalizeRecoveryCode("k7qm2xr6")).toBe("k7qm-2xr6");
    expect(normalizeRecoveryCode("123456")).toBeNull();
    expect(normalizeRecoveryCode("k7qm-2xr9")).toBeNull(); // 9 is not a base32 character
    expect(hashRecoveryCode("k7qm-2xr9")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("admin powers wait for two-factor", () => {
  it("an admin session that hasn't passed two-factor can only reach account and set-up", () => {
    const pending = { id: "a", role: "SUPER_ADMIN" as const, status: "ACTIVE" as const, mfaPending: true };
    expect(can(pending, "users:manage")).toBe(false);
    expect(can(pending, "settings:manage")).toBe(false);
    expect(can(pending, "admin-area:access")).toBe(false);
    expect(can(pending, "security:manage-own")).toBe(true);
    expect(can(pending, "account:view")).toBe(true);
    expect(can({ ...pending, mfaPending: false }, "users:manage")).toBe(true);
  });
  it("only admins need it, and they need it on AND used this session", () => {
    expect(mfaSatisfied("CUSTOMER", null, undefined)).toBe(true);
    expect(mfaSatisfied("PROVIDER", null, false)).toBe(true);
    expect(mfaSatisfied("ADMIN", null, true)).toBe(false);
    expect(mfaSatisfied("ADMIN", new Date(), false)).toBe(false);
    expect(mfaSatisfied("ADMIN", new Date(), true)).toBe(true);
  });
});
