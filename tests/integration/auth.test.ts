import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createAdminUser,
  createPasswordResetToken,
  hashToken,
  isResetTokenValid,
  registerUser,
  resetPassword,
  verifyCredentials,
} from "@/lib/services/auth";
import { signupSchema } from "@/lib/validators/auth";

// Unique per run so reruns never collide with leftovers; everything is deleted in afterAll.
const run = Date.now().toString(36);
const email = (n: string) => `${n}-${run}@test.gobig.local`;
// 07xx numbers made unique per run from the timestamp.
const phone = (i: number) => `07${(Number.parseInt(run, 36) % 1e7).toString().padStart(7, "0")}${i}`;

function signup(overrides: Record<string, string>) {
  const r = signupSchema.safeParse({ role: "CUSTOMER", name: "Test User", password: "Kariakoo-fundi-7", confirmPassword: "Kariakoo-fundi-7", ...overrides });
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data;
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { OR: [{ email: { endsWith: `-${run}@test.gobig.local` } }, { name: { startsWith: `T-${run}` } }] } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("registration", () => {
  it("creates a customer with an email and a provider with a phone", async () => {
    const c = await registerUser(signup({ email: email("cust") }));
    expect(c).toMatchObject({ ok: true, user: { role: "CUSTOMER" } });

    const p = await registerUser(signup({ role: "PROVIDER", name: `T-${run} provider`, phone: phone(1) }), "en");
    expect(p).toMatchObject({ ok: true, user: { role: "PROVIDER" } });
    const row = await prisma.user.findFirstOrThrow({ where: { name: `T-${run} provider` } });
    expect(row.phone).toMatch(/^2557\d{8}$/);
    expect(row.locale).toBe("en");
    expect(row.passwordHash).not.toContain("Kariakoo-fundi-7");
  });

  it("rejects a duplicate email or phone, reporting which", async () => {
    expect(await registerUser(signup({ email: email("cust") }))).toEqual({ ok: false, error: "emailTaken" });
    expect(await registerUser(signup({ name: `T-${run} dup`, phone: phone(1) }))).toEqual({ ok: false, error: "phoneTaken" });
  });

  it("is blocked by the database when neither email nor phone is present", async () => {
    await expect(prisma.user.create({ data: { name: `T-${run} none`, passwordHash: "x" } })).rejects.toThrow();
  });
});

describe("login", () => {
  it("accepts email in any case and phone in any common format", async () => {
    expect((await verifyCredentials(email("cust").toUpperCase(), "Kariakoo-fundi-7")).ok).toBe(true);
    const local = phone(1);
    expect((await verifyCredentials(`+255 ${local.slice(1)}`, "Kariakoo-fundi-7")).ok).toBe(true);
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    expect(await verifyCredentials(email("cust"), "wrong-password")).toEqual({ ok: false, error: "invalid" });
    expect(await verifyCredentials(email("nobody"), "Kariakoo-fundi-7")).toEqual({ ok: false, error: "invalid" });
  });

  it("refuses suspended and deleted accounts", async () => {
    await registerUser(signup({ email: email("susp") }));
    await prisma.user.update({ where: { email: email("susp") }, data: { status: "SUSPENDED" } });
    expect(await verifyCredentials(email("susp"), "Kariakoo-fundi-7")).toEqual({ ok: false, error: "suspended" });

    await registerUser(signup({ email: email("gone") }));
    await prisma.user.update({ where: { email: email("gone") }, data: { deletedAt: new Date() } });
    expect(await verifyCredentials(email("gone"), "Kariakoo-fundi-7")).toEqual({ ok: false, error: "invalid" });
  });

  it("records the last login time", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: email("cust") } });
    expect(u.lastLoginAt).not.toBeNull();
  });
});

describe("admin creation", () => {
  it("creates an ADMIN (never SUPER_ADMIN) and rejects a duplicate email", async () => {
    expect(await createAdminUser({ name: "Admin", email: email("admin"), password: "admin-pass-123" })).toMatchObject({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: email("admin") } })).role).toBe("ADMIN");
    expect(await createAdminUser({ name: "Admin", email: email("admin"), password: "admin-pass-123" })).toEqual({ ok: false, error: "emailTaken" });
    expect(await createAdminUser({ name: "Admin", email: email("cust"), password: "admin-pass-123" })).toEqual({ ok: false, error: "emailTaken" });
  });
});

describe("password reset", () => {
  it("issues nothing for unknown or suspended accounts", async () => {
    expect(await createPasswordResetToken(email("nobody"))).toBeNull();
    expect(await createPasswordResetToken(email("susp"))).toBeNull();
  });

  it("stores only a hash, resets once, and moves passwordChangedAt forward", async () => {
    await registerUser(signup({ email: email("reset") }));
    const before = await prisma.user.findUniqueOrThrow({ where: { email: email("reset") } });

    const req = await createPasswordResetToken(email("reset"));
    expect(req).not.toBeNull();
    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: before.id } });
    expect(stored.tokenHash).toBe(hashToken(req!.token));
    expect(stored.tokenHash).not.toBe(req!.token);
    expect(await isResetTokenValid(req!.token)).toBe(true);

    expect(await resetPassword(req!.token, "brand-new-pass")).toBe(true);
    expect(await resetPassword(req!.token, "second-attempt")).toBe(false);
    expect(await isResetTokenValid(req!.token)).toBe(false);

    expect((await verifyCredentials(email("reset"), "Kariakoo-fundi-7")).ok).toBe(false);
    expect((await verifyCredentials(email("reset"), "brand-new-pass")).ok).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { email: email("reset") } });
    expect(after.passwordChangedAt.getTime()).toBeGreaterThan(before.passwordChangedAt.getTime());
  });

  it("refuses a second link within the cooldown", async () => {
    await prisma.passwordResetToken.deleteMany({ where: { user: { email: email("cust") } } });
    expect(await createPasswordResetToken(email("cust"))).not.toBeNull();
    expect(await createPasswordResetToken(email("cust"))).toBeNull();
  });

  it("rejects an expired token", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: email("cust") } });
    await prisma.passwordResetToken.create({
      data: { userId: u.id, tokenHash: hashToken(`expired-${run}`), expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await isResetTokenValid(`expired-${run}`)).toBe(false);
    expect(await resetPassword(`expired-${run}`, "whatever-123")).toBe(false);
  });

  it("rejects a made-up token", async () => {
    expect(await resetPassword("x".repeat(43), "whatever-123")).toBe(false);
  });
});
