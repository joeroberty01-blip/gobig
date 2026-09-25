import { describe, expect, it } from "vitest";
import { darToday, messageSchema, quoteSchema, requestSchema } from "@/lib/validators/requests";
import { effectiveStatus, expiryFor } from "@/lib/services/requests";
import { can } from "@/lib/permissions";
import { getDictionary } from "@/lib/i18n/dictionaries";

const valid = {
  categoryId: "cat1",
  serviceId: "",
  description: "Need two ACs serviced this week.",
  locationId: "loc1",
  addressText: "",
  preferredDate: null,
  preferredTime: "09:30",
  budgetMin: "50,000",
  budgetMax: "",
  contactPreference: "IN_APP" as const,
  targetProviderSlug: null,
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 24 * 60 * 60 * 1000;

describe("request form validation", () => {
  it("parses a normal request", () => {
    const r = requestSchema.parse(valid);
    expect(r).toMatchObject({ categoryId: "cat1", serviceId: null, addressText: null, preferredTime: 570, budgetMin: 50_000, budgetMax: null });
  });
  it("needs a category or a service, and a real description", () => {
    expect(requestSchema.safeParse({ ...valid, categoryId: "" }).error?.issues[0]?.message).toBe("serviceRequired");
    expect(requestSchema.safeParse({ ...valid, description: "short" }).error?.issues[0]?.message).toBe("requestTooShort");
    expect(requestSchema.safeParse({ ...valid, description: "x".repeat(2001) }).error?.issues[0]?.message).toBe("requestTooLong");
  });
  it("budgets are whole, non-negative and ordered", () => {
    expect(requestSchema.safeParse({ ...valid, budgetMin: "-5" }).error?.issues[0]?.message).toBe("budgetInvalid");
    expect(requestSchema.safeParse({ ...valid, budgetMin: "12.5" }).error?.issues[0]?.message).toBe("budgetInvalid");
    expect(requestSchema.safeParse({ ...valid, budgetMin: 90_000, budgetMax: 10_000 }).error?.issues[0]?.message).toBe("budgetInvalid");
  });
  it("dates run from today (Dar time) to 60 days ahead; times are HH:MM", () => {
    const today = darToday();
    expect(requestSchema.parse({ ...valid, preferredDate: iso(today) }).preferredDate?.getTime()).toBe(today.getTime());
    expect(requestSchema.safeParse({ ...valid, preferredDate: iso(new Date(today.getTime() - DAY)) }).success).toBe(false);
    expect(requestSchema.safeParse({ ...valid, preferredDate: iso(new Date(today.getTime() + 61 * DAY)) }).success).toBe(false);
    expect(requestSchema.safeParse({ ...valid, preferredDate: "2026-02-31" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...valid, preferredTime: "24:00" }).error?.issues[0]?.message).toBe("timeInvalid");
  });
  it("Dar es Salaam's day starts at 21:00 UTC", () => {
    expect(iso(darToday(new Date("2026-09-24T20:59:00Z")))).toBe("2026-09-24");
    expect(iso(darToday(new Date("2026-09-24T21:00:00Z")))).toBe("2026-09-25");
  });
  it("contact preference and provider slug are constrained", () => {
    expect(requestSchema.safeParse({ ...valid, contactPreference: "EMAIL" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...valid, targetProviderSlug: "../admin" }).success).toBe(false);
  });
});

describe("quotes and messages", () => {
  it("quotes are positive whole TSh", () => {
    expect(quoteSchema.parse({ requestId: "r1", amount: "65,000", note: "", validUntil: null })).toMatchObject({ amount: 65_000, note: null });
    expect(quoteSchema.safeParse({ requestId: "r1", amount: "0" }).error?.issues[0]?.message).toBe("amountInvalid");
    expect(quoteSchema.safeParse({ requestId: "r1", amount: "" }).error?.issues[0]?.message).toBe("amountInvalid");
  });
  it("messages are trimmed, non-empty and capped", () => {
    expect(messageSchema.parse({ matchId: "m1", body: "  hi  " }).body).toBe("hi");
    expect(messageSchema.safeParse({ matchId: "m1", body: "   " }).error?.issues[0]?.message).toBe("messageRequired");
    expect(messageSchema.safeParse({ matchId: "m1", body: "x".repeat(2001) }).error?.issues[0]?.message).toBe("messageTooLong");
  });
});

describe("lifecycle helpers", () => {
  const now = new Date("2026-09-24T07:00:00Z");
  it("open requests past their expiry read as expired", () => {
    expect(effectiveStatus({ status: "OPEN", expiresAt: new Date(now.getTime() - 1) }, now)).toBe("EXPIRED");
    expect(effectiveStatus({ status: "OPEN", expiresAt: new Date(now.getTime() + 1) }, now)).toBe("OPEN");
    expect(effectiveStatus({ status: "ACCEPTED", expiresAt: new Date(0) }, now)).toBe("ACCEPTED");
  });
  it("undated requests stay open 14 days; dated ones until that day ends in Dar", () => {
    expect(expiryFor(null, now).getTime()).toBe(now.getTime() + 14 * DAY);
    expect(expiryFor(new Date("2026-09-26T00:00:00Z"), now).toISOString()).toBe("2026-09-26T21:00:00.000Z");
  });
});

describe("permissions", () => {
  const actor = (role: "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPER_ADMIN") => ({ id: "u", role, status: "ACTIVE" as const });
  it("only customers post; only providers respond", () => {
    expect(can(actor("CUSTOMER"), "requests:create")).toBe(true);
    expect(can(actor("PROVIDER"), "requests:create")).toBe(false);
    expect(can(actor("ADMIN"), "requests:create")).toBe(false);
    expect(can(actor("PROVIDER"), "requests:respond")).toBe(true);
    expect(can(actor("CUSTOMER"), "requests:respond")).toBe(false);
    expect(can({ ...actor("CUSTOMER"), status: "SUSPENDED" }, "requests:create")).toBe(false);
  });
});

describe("translations", () => {
  it("every notification type has text in both languages", () => {
    for (const locale of ["sw", "en"] as const) {
      const n = getDictionary(locale).requests.notifications;
      for (const k of ["REQUEST_NEW", "REQUEST_INTEREST", "QUOTE_NEW", "MESSAGE_NEW", "QUOTE_ACCEPTED", "REQUEST_NOT_SELECTED", "REQUEST_CANCELLED", "REQUEST_COMPLETED"] as const) {
        expect(n[k]).toContain("{service}");
      }
    }
  });
});
