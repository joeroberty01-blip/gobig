import { describe, expect, it } from "vitest";
import { darDayStart, defaultPreferences, quietUntil, TYPE_CATEGORY, URGENT } from "@/lib/notifications/preferences";
import { allowedPushEndpoint } from "@/lib/notifications/subscription";

const at = (iso: string) => new Date(iso); // Dar es Salaam = UTC+3

describe("quiet hours (Dar es Salaam time)", () => {
  const quiet = { quietStart: 21 * 60, quietEnd: 7 * 60 }; // 21:00–07:00

  it("holds messages overnight, across midnight, until 07:00", () => {
    expect(quietUntil(quiet, at("2026-09-28T19:30:00Z"))?.toISOString()).toBe("2026-09-29T04:00:00.000Z"); // 22:30 → 07:00
    expect(quietUntil(quiet, at("2026-09-28T23:10:00Z"))?.toISOString()).toBe("2026-09-29T04:00:00.000Z"); // 02:10 → 07:00
  });

  it("lets daytime messages through, and 'no quiet hours' means none", () => {
    expect(quietUntil(quiet, at("2026-09-28T09:00:00Z"))).toBeNull(); // 12:00
    expect(quietUntil(quiet, at("2026-09-29T04:00:00Z"))).toBeNull(); // exactly 07:00
    expect(quietUntil({ quietStart: null, quietEnd: null }, at("2026-09-28T20:00:00Z"))).toBeNull();
  });

  it("works for a daytime window too", () => {
    expect(quietUntil({ quietStart: 13 * 60, quietEnd: 14 * 60 }, at("2026-09-28T10:30:00Z"))?.toISOString()).toBe("2026-09-28T11:00:00.000Z");
  });

  it("counts the day from midnight in Dar, not UTC", () => {
    expect(darDayStart(at("2026-09-28T22:30:00Z")).toISOString()).toBe("2026-09-28T21:00:00.000Z"); // 01:30 on the 29th
  });
});

describe("defaults and categories", () => {
  it("push on except marketing; email opt-in; SMS for jobs not chat or marketing; quiet 21:00–07:00", () => {
    const d = defaultPreferences();
    expect(d.categories.REQUESTS).toEqual({ push: true, email: false, sms: true });
    expect(d.categories.MESSAGES).toEqual({ push: true, email: false, sms: false });
    expect(d.categories.MARKETING).toEqual({ push: false, email: false, sms: false });
    expect([d.quietStart, d.quietEnd]).toEqual([1260, 420]);
  });

  it("every urgent type is a trip update", () => {
    for (const t of URGENT) expect(TYPE_CATEGORY[t]).toBe("TRIPS");
  });
});

describe("push endpoints (SEC-056)", () => {
  it("accepts the real push services only", () => {
    expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(allowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(allowedPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=abc")).toBe(true);
  });

  it("refuses anything that could point the server elsewhere", () => {
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://127.0.0.1/x",
      "https://localhost/x",
      "https://169.254.169.254/latest/meta-data",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilfcm.googleapis.com.example/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pw@fcm.googleapis.com/x",
      "not a url",
    ])
      expect(allowedPushEndpoint(bad)).toBe(false);
  });
});
