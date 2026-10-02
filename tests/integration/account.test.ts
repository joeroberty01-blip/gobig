import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/services/auth";
import { changePassword, deleteAccount, DELETED_NAME, deletedEmail, signOutEverywhere, updateName } from "@/lib/services/account";

// Settings page: a person's own account on the test branch.
const run = `a${Date.now().toString(36)}`;
const domain = ".account.test.gobig.local";
const PASSWORD = "Mlima-Kilimanjaro-42";
const ids: string[] = [];

async function makeUser(name: string, role: "CUSTOMER" | "PROVIDER" = "CUSTOMER") {
  const u = await prisma.user.create({
    data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${run}${domain}`, phone: null, passwordHash: await hashPassword(PASSWORD), role },
  });
  ids.push(u.id);
  return u.id;
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { OR: [{ id: { in: ids } }, { email: { endsWith: domain } }] } });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("settings: name", () => {
  it("accepts a real name and rejects links, digits and junk", async () => {
    const id = await makeUser("Name Person");
    expect(await updateName(id, "J. O'Brien")).toEqual({ ok: true });
    expect(await updateName(id, "  Neema   Joseph-Mushi ")).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).name).toBe("Neema Joseph-Mushi");
    for (const bad of ["x", "Call 0712345678", "visit www.example.com", "a".repeat(81)]) {
      expect(await updateName(id, bad)).toEqual({ ok: false, error: "nameInvalid" });
    }
  });
});

describe("settings: password and sessions", () => {
  it("needs the current password, refuses the same one, and ends old sessions", async () => {
    const id = await makeUser("Password Person");
    const before = (await prisma.user.findUniqueOrThrow({ where: { id } })).passwordChangedAt;
    expect(await changePassword(id, "wrong-password", "Another-Good-One-9")).toEqual({ ok: false, error: "wrongPassword" });
    expect(await changePassword(id, PASSWORD, PASSWORD)).toEqual({ ok: false, error: "samePassword" });
    expect(await changePassword(id, PASSWORD, "Another-Good-One-9")).toEqual({ ok: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.passwordChangedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "account.password_changed" } })).toBe(1);
  });

  it("sign out everywhere moves the session cut-off and forgets devices", async () => {
    const id = await makeUser("Signout Person");
    await prisma.pushSubscription.create({ data: { userId: id, endpoint: `https://fcm.googleapis.com/fcm/send/${run}`, p256dh: "k", auth: "a" } });
    const before = (await prisma.user.findUniqueOrThrow({ where: { id } })).passwordChangedAt;
    await signOutEverywhere(id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).passwordChangedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(await prisma.pushSubscription.count({ where: { userId: id } })).toBe(0);
  });
});

describe("settings: delete account", () => {
  it("business accounts go through support", async () => {
    const id = await makeUser("Owner Person", "PROVIDER");
    expect(await deleteAccount(id, PASSWORD)).toEqual({ ok: false, error: "notCustomer" });
  });

  it("wrong password changes nothing", async () => {
    const id = await makeUser("Careful Person");
    expect(await deleteAccount(id, "nope")).toEqual({ ok: false, error: "wrongPassword" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
  });

  it("wipes personal details, saved items and open requests; the account can't be used again", async () => {
    const id = await makeUser("Leaving Person");
    const provider = await prisma.provider.findFirstOrThrow({ where: { status: "ACTIVE", deletedAt: null } });
    await prisma.favorite.create({ data: { userId: id, providerId: provider.id } });
    const location = await prisma.location.findUniqueOrThrow({ where: { slug: "kariakoo" } });
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const req = await prisma.serviceRequest.create({
      data: { customerId: id, categoryId: category.id, description: `Delete test ${run}`, locationId: location.id, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    expect(await deleteAccount(id, PASSWORD)).toEqual({ ok: true });
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(u).toMatchObject({ name: DELETED_NAME, email: deletedEmail(id), phone: null, totpSecretEnc: null });
    expect(u.deletedAt).not.toBeNull();
    expect(await prisma.favorite.count({ where: { userId: id } })).toBe(0);
    expect((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
    // The old password no longer works for anything, including a second delete.
    expect(await deleteAccount(id, PASSWORD)).toEqual({ ok: false, error: "wrongPassword" });
    expect(await changePassword(id, PASSWORD, "Whatever-Else-77")).toEqual({ ok: false, error: "wrongPassword" });
    await prisma.serviceRequest.delete({ where: { id: req.id } });
  });
});
