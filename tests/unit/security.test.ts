import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/security";
import { MAX_QUERY_TOKENS, queryTokens } from "@/lib/discovery/query";
import { signupSchema } from "@/lib/validators/auth";
import { contactSchema, locationSchema } from "@/lib/validators/provider";

// Security regression tests (see SECURITY_BACKLOG.md). Each names the issue it guards.

describe("SEC-005 upload same-origin check", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("accepts same-origin requests", () => {
    expect(isSameOrigin(h({ origin: "https://gobig.co.tz", host: "gobig.co.tz" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
  });
  it("refuses cross-site requests", () => {
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "gobig.co.tz" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "https://gobig.co.tz.evil.example", host: "gobig.co.tz" }))).toBe(false);
    expect(isSameOrigin(h({ "sec-fetch-site": "cross-site", host: "gobig.co.tz" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "null", host: "gobig.co.tz" }))).toBe(false);
  });
});

describe("SEC-009 search cost is bounded", () => {
  it("matches at most MAX_QUERY_TOKENS words", () => {
    expect(queryTokens("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10")).toHaveLength(MAX_QUERY_TOKENS);
  });
});

describe("mass assignment: client can't set privileged fields", () => {
  it("sign-up strips anything but the allowed fields and never allows admin roles", () => {
    const r = signupSchema.safeParse({
      role: "CUSTOMER",
      name: "Asha",
      phone: "0712345678",
      password: "Kariakoo-fundi-7",
      confirmPassword: "Kariakoo-fundi-7",
      status: "ACTIVE",
      verified: true,
      passwordHash: "x",
    });
    expect(r.success && Object.keys(r.data).sort()).toEqual(["email", "name", "password", "phone", "role"]);
    expect(signupSchema.safeParse({ role: "SUPER_ADMIN", name: "x", phone: "0712345678", password: "Kariakoo-fundi-7", confirmPassword: "Kariakoo-fundi-7" }).success).toBe(false);
  });
  it("profile sections ignore provider-controlled status/ownership fields", () => {
    const c = contactSchema.parse({ phone: "0712345678", email: "", status: "ACTIVE", providerId: "someone-else" } as never);
    expect(Object.keys(c).sort()).toEqual(["email", "phone"]);
    const l = locationSchema.parse({ locationId: "x", addressText: "", visibility: "AREA_ONLY", providerId: "someone-else" } as never);
    expect(l).not.toHaveProperty("providerId");
  });
});
