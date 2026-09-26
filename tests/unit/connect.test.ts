import { describe, expect, it } from "vitest";
import { actionHref, isActionAvailable, openerText, requestQuoteHref, visibleActions, type ConnectSource } from "@/lib/provider/connect";
import { actionsSchema } from "@/lib/validators/provider";
import { darDay, visitorHash } from "@/lib/services/connectEvents";

const src: ConnectSource = {
  phone: "255712345678",
  whatsapp: null,
  website: null,
  email: "biz@example.com",
  bookingUrl: "https://book.example.com/juma",
  rideUrl: null,
  addressText: null,
  locationVisibility: "AREA_ONLY",
  areaName: "Sinza",
};

describe("Phase 6 buttons are offered only when their data exists", () => {
  it("new actions", () => {
    expect(isActionAvailable("MESSAGE", src)).toBe(true);
    expect(isActionAvailable("BOOK_SERVICE", src)).toBe(true);
    expect(isActionAvailable("BOOK_RIDE", src)).toBe(false);
    expect(isActionAvailable("REQUEST_QUOTE", src)).toBe(true);
    // Phase 7: requests are delivered inside NEXA, so no contact details are needed.
    expect(isActionAvailable("REQUEST_QUOTE", { ...src, phone: null, whatsapp: null, email: null })).toBe(true);
  });
  it("only chosen and possible actions show, in a fixed order", () => {
    expect(visibleActions(["EMAIL", "BOOK_RIDE", "BOOK_SERVICE", "CALL", "REQUEST_QUOTE"], src)).toEqual(["CALL", "REQUEST_QUOTE", "BOOK_SERVICE", "EMAIL"]);
  });
});

describe("links", () => {
  it("SMS and WhatsApp carry an encoded greeting", () => {
    const opener = openerText("sw", "Juma & Sons");
    expect(actionHref("MESSAGE", src, opener)).toBe(`sms:+255712345678?body=${encodeURIComponent(opener)}`);
    expect(actionHref("WHATSAPP", { ...src, whatsapp: "255712345678" }, opener)).toContain("text=Habari%20Juma%20%26%20Sons");
  });
  it("booking opens the provider's own link; quote opens the in-app request form", () => {
    expect(actionHref("BOOK_SERVICE", src)).toBe("https://book.example.com/juma");
    expect(actionHref("REQUEST_QUOTE", src)).toBeNull();
    expect(requestQuoteHref("juma-ac")).toBe("/requests/new?provider=juma-ac");
  });
});

describe("booking link validation", () => {
  it("accepts http(s) links and refuses scripts and junk", () => {
    expect(actionsSchema.parse({ actions: [], bookingUrl: "book.example.com" }).bookingUrl).toBe("https://book.example.com/");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com", "not a url"]) {
      expect(actionsSchema.safeParse({ actions: [], bookingUrl: bad }).success).toBe(false);
    }
  });
  it("undefined leaves the saved link alone; empty removes it", () => {
    expect(actionsSchema.parse({ actions: [] }).bookingUrl).toBeUndefined();
    expect(actionsSchema.parse({ actions: [], rideUrl: "" }).rideUrl).toBeNull();
  });
  it("reports the error on the right field", () => {
    expect(actionsSchema.safeParse({ actions: [], rideUrl: "javascript:x" }).error?.issues[0]?.path).toEqual(["rideUrl"]);
  });
});

describe("anonymous visitor hashing", () => {
  it("uses the Dar es Salaam calendar day", () => {
    expect(darDay(new Date("2026-09-24T20:59:00Z")).toISOString().slice(0, 10)).toBe("2026-09-24");
    expect(darDay(new Date("2026-09-24T21:01:00Z")).toISOString().slice(0, 10)).toBe("2026-09-25");
  });
  it("is stable within a day/provider but unlinkable across days and providers", () => {
    const day = darDay(new Date("2026-09-24T07:00:00Z"));
    const next = darDay(new Date("2026-09-25T07:00:00Z"));
    const h = visitorHash("visitor-1", "prov-a", day);
    expect(visitorHash("visitor-1", "prov-a", day)).toBe(h);
    expect(visitorHash("visitor-1", "prov-a", next)).not.toBe(h);
    expect(visitorHash("visitor-1", "prov-b", day)).not.toBe(h);
    expect(h).not.toContain("visitor-1");
  });
});
