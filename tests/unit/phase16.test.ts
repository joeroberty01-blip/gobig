import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { redact } from "@/lib/log";
import { backoffMs } from "@/lib/jobs/queue";
import { open, openPoint, seal, sealPoint } from "@/lib/crypto/fieldCipher";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
});

describe("field encryption", () => {
  it("round-trips and never stores the plain value", () => {
    const s = seal("+255712345678", "recipient-phone");
    expect(s).not.toContain("712345678");
    expect(open(s, "recipient-phone")).toBe("+255712345678");
  });

  it("is bound to its purpose", () => {
    const s = seal("secret", "a");
    expect(() => open(s, "b")).toThrow();
  });

  it("detects tampering", () => {
    const parts = seal("hello", "p").split(".");
    parts[4] = Buffer.from("jello").toString("base64url");
    expect(() => open(parts.join("."), "p")).toThrow();
  });

  it("keeps reading old values after key rotation", () => {
    const old = sealPoint({ lat: -6.7924, lng: 39.2083 }, "pickup");
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(openPoint(old, "pickup")).toEqual({ lat: -6.7924, lng: 39.2083 });
    delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
    expect(() => openPoint(old, "pickup")).toThrow(); // retired key: unreadable
  });

  it("refuses to work without a valid key", () => {
    const saved = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = "short";
    expect(() => seal("x", "p")).toThrow(/DATA_ENCRYPTION_KEY/);
    process.env.DATA_ENCRYPTION_KEY = saved;
  });
});

describe("log redaction", () => {
  it("hides secrets, contact details and exact coordinates, keeps the rest", () => {
    const out = redact({ password: "p", token: "t", phone: "+255", email: "a@b", lat: -6.8, lng: 39.2, recipientName: "Asha", statusCode: 500, jobId: "j1", nested: { apiKey: "k", ok: true } });
    expect(out).toEqual({ password: "[redacted]", token: "[redacted]", phone: "[redacted]", email: "[redacted]", lat: "[redacted]", lng: "[redacted]", recipientName: "[redacted]", statusCode: 500, jobId: "j1", nested: { apiKey: "[redacted]", ok: true } });
  });
});

describe("job backoff", () => {
  it("grows and caps", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(20)).toBe(6 * 60 * 60_000);
  });
});
