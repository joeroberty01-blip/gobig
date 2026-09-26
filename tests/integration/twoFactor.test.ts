import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import * as tf from "@/lib/services/twoFactor";
import { base32Decode, hotp, stepAt } from "@/lib/totp";

// Phase 13 (SEC-042) against the test branch.
const run = `t${Date.now().toString(36)}`;
const domain = ".twofactor.test.gobig.local";
let adminId: string;
let superId: string;
let secret: string;
let recovery: string[];
const code = (at: Date, d = 0) => hotp(base32Decode(secret), stepAt(at) + d);

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
  adminId = (await prisma.user.create({ data: { name: "TF Admin", email: `admin-${run}${domain}`, passwordHash: "x", role: "ADMIN" } })).id;
  superId = (await prisma.user.create({ data: { name: "TF Super", email: `super-${run}${domain}`, passwordHash: "x", role: "SUPER_ADMIN" } })).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
  await prisma.$disconnect();
});

describe("enrollment", () => {
  it("a started set-up isn't active until confirmed with a real code", async () => {
    const r = await tf.beginEnrollment(adminId);
    if (!r.ok) throw new Error(r.error);
    secret = r.secret;
    expect(r.uri).toContain("otpauth://totp/");
    expect(await tf.hasTwoFactor(adminId)).toBe(false);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(stored.totpSecretEnc).not.toContain(secret); // encrypted at rest
    expect(await tf.confirmEnrollment(adminId, "000000")).toEqual({ ok: false, error: "otpInvalid" });
  });

  it("confirming turns it on and returns 8 recovery codes (stored hashed)", async () => {
    const r = await tf.confirmEnrollment(adminId, code(new Date()));
    if (!r.ok) throw new Error(r.error);
    recovery = r.recoveryCodes;
    expect(recovery).toHaveLength(8);
    expect(await tf.hasTwoFactor(adminId)).toBe(true);
    const rows = await prisma.totpRecoveryCode.findMany({ where: { userId: adminId } });
    expect(rows).toHaveLength(8);
    for (const row of rows) expect(recovery).not.toContain(row.codeHash);
    expect(await tf.beginEnrollment(adminId)).toEqual({ ok: false, error: "alreadyEnabled" });
    expect(await prisma.auditLog.count({ where: { entityId: adminId, action: "security.totp_enabled" } })).toBe(1);
  });
});

describe("signing in", () => {
  it("a fresh code works once; the same code can't be replayed", async () => {
    const later = new Date(Date.now() + 60_000); // a step after the one used to enroll
    const c = code(later);
    expect(await tf.verifySecondFactor(adminId, c, later)).toEqual({ ok: true, method: "totp" });
    expect(await tf.verifySecondFactor(adminId, c, later)).toEqual({ ok: false });
  });

  it("a recovery code works exactly once", async () => {
    const r = recovery[0]!;
    expect(await tf.verifySecondFactor(adminId, r.toUpperCase().replace("-", " "))).toEqual({ ok: true, method: "recovery" });
    expect(await tf.verifySecondFactor(adminId, r)).toEqual({ ok: false });
    expect((await tf.twoFactorStatus(adminId)).recoveryCodesLeft).toBe(7);
  });

  it("wrong or malformed input fails; accounts without two-factor never pass", async () => {
    expect(await tf.verifySecondFactor(adminId, "abcd-efgh")).toEqual({ ok: false });
    expect(await tf.verifySecondFactor(adminId, "")).toEqual({ ok: false });
    expect(await tf.verifySecondFactor(superId, "123456")).toEqual({ ok: false });
  });

  it("new recovery codes need a current code and replace the old ones", async () => {
    const at = new Date(Date.now() + 120_000);
    const r = await tf.regenerateRecoveryCodes(adminId, code(at), at);
    if (!r.ok) throw new Error(r.error);
    expect(await tf.verifySecondFactor(adminId, recovery[1]!)).toEqual({ ok: false }); // old code gone
    expect((await tf.twoFactorStatus(adminId)).recoveryCodesLeft).toBe(8);
  });
});

describe("reset (lost device)", () => {
  it("only a super admin, never on themselves, and it's audited", async () => {
    expect(await tf.resetTwoFactor({ id: adminId, role: "ADMIN" }, superId, "x")).toEqual({ ok: false, error: "superAdminOnly" });
    expect(await tf.resetTwoFactor({ id: superId, role: "SUPER_ADMIN" }, superId, "x")).toEqual({ ok: false, error: "cannotSelf" });
    expect(await tf.resetTwoFactor({ id: superId, role: "SUPER_ADMIN" }, adminId, "lost phone")).toEqual({ ok: true });
    expect(await tf.hasTwoFactor(adminId)).toBe(false);
    expect(await prisma.totpRecoveryCode.count({ where: { userId: adminId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: adminId, action: "security.totp_reset", actorId: superId } })).toBe(1);
  });
});
