import { describe, expect, it } from "vitest";
import { _test, isBot, isPrefetch, METRIC_SOURCES, sourceFromReferer } from "@/lib/services/metrics";
import { can } from "@/lib/permissions";
import { getDictionary } from "@/lib/i18n/dictionaries";

const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

describe("who counts", () => {
  it("bots, link previews and scripts are not customers", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("WhatsApp/2.23.20.0 A")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe(false);
  });
  it("prefetches are ignored", () => {
    expect(isPrefetch(headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetch(headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetch(headers({ purpose: "prefetch" }))).toBe(true);
    expect(isPrefetch(headers({}))).toBe(false);
  });
});

describe("where a profile visit came from", () => {
  const host = "gobig.co.tz";
  it("classifies same-site pages", () => {
    expect(sourceFromReferer("https://gobig.co.tz/", host)).toBe("HOME");
    expect(sourceFromReferer("https://gobig.co.tz/search?q=fundi", host)).toBe("SEARCH");
    expect(sourceFromReferer("https://gobig.co.tz/ask?q=ac", host)).toBe("AI_SEARCH");
    expect(sourceFromReferer("https://gobig.co.tz/c/plumbing", host)).toBe("CATEGORY");
    expect(sourceFromReferer("https://gobig.co.tz/requests/abc", host)).toBe("REQUEST");
    expect(sourceFromReferer("https://gobig.co.tz/saved", host)).toBe("SAVED");
  });
  it("other sites, missing or broken referrers, and look-alike paths are OTHER", () => {
    expect(sourceFromReferer("https://www.google.com/", host)).toBe("OTHER");
    expect(sourceFromReferer("https://gobig.co.tz.evil.com/search", host)).toBe("OTHER");
    expect(sourceFromReferer(null, host)).toBe("OTHER");
    expect(sourceFromReferer("not a url", host)).toBe("OTHER");
    expect(sourceFromReferer("https://gobig.co.tz/searching", host)).toBe("OTHER");
  });
});

describe("periods", () => {
  it("cover whole Dar days, today included, with an equal span before", () => {
    const { today, since, prevSince } = _test.range(7, new Date("2026-09-25T20:30:00Z")); // 23:30 in Dar
    expect(today.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(since.toISOString().slice(0, 10)).toBe("2026-09-19");
    expect(prevSince.toISOString().slice(0, 10)).toBe("2026-09-12");
    expect(_test.range(7, new Date("2026-09-25T21:30:00Z")).today.toISOString().slice(0, 10)).toBe("2026-09-26");
  });
});

describe("permissions and text", () => {
  const actor = (role: "CUSTOMER" | "PROVIDER" | "ADMIN") => ({ id: "u", role, status: "ACTIVE" as const });
  it("customers save providers; providers see their own analytics", () => {
    expect(can(actor("CUSTOMER"), "favorites:use")).toBe(true);
    expect(can(actor("PROVIDER"), "favorites:use")).toBe(false);
    expect(can(actor("PROVIDER"), "analytics:view-own")).toBe(true);
    expect(can(actor("CUSTOMER"), "analytics:view-own")).toBe(false);
    expect(can(actor("ADMIN"), "analytics:view-own")).toBe(false);
  });
  it("every source has a label in both languages", () => {
    for (const locale of ["sw", "en"] as const) {
      const s = getDictionary(locale).insights.sources;
      for (const k of METRIC_SOURCES) expect(s[k]).toBeTruthy();
    }
  });
});
