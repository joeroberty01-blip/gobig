import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { assistRequest } from "@/lib/services/requestAssist";
import { LIMITS } from "@/lib/services/rateLimit";

// Automation Engine, Phase E: "Help me write" on the test branch. useAi:false everywhere — tests
// never call the paid model; the rule-based path and the limits are what's checked here.
const domain = ".assist.test.gobig.local";
let customerId: string;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
  customerId = (await prisma.user.create({ data: { name: "Assist Customer", email: `assist-${Date.now()}${domain}`, passwordHash: "x", role: "CUSTOMER" } })).id;
});
afterAll(() => prisma.user.deleteMany({ where: { email: { endsWith: domain } } }));

describe("help me write", () => {
  it("refuses empty or overlong text", async () => {
    expect(await assistRequest(customerId, "hi", null, { useAi: false })).toEqual({ ok: false, error: "tooShort" });
    expect(await assistRequest(customerId, "x".repeat(1500), null, { useAi: false })).toEqual({ ok: false, error: "tooLong" });
  });

  it("without the model, keeps the customer's words and lists likely gaps", async () => {
    const service = await prisma.service.findUniqueOrThrow({ where: { slug: "pipe-leak-repair" } });
    const r = await assistRequest(customerId, "  Bomba   linavuja sana  ", service.id, { useAi: false });
    expect(r).toMatchObject({ ok: true, suggestion: "Bomba linavuja sana", rewritten: false, source: "rules" });
    if (r.ok) expect(r.missing).toEqual(expect.arrayContaining(["WHEN"]));
  });

  it("is rate limited per customer", async () => {
    for (let i = 0; i < LIMITS.aiAssistPerUser.max; i++) await assistRequest(customerId, "Bomba linavuja jikoni", null, { useAi: false });
    expect(await assistRequest(customerId, "Bomba linavuja jikoni", null, { useAi: false })).toEqual({ ok: false, error: "rateLimited" });
  });
});
