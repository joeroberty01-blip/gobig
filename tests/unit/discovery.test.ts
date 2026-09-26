import { describe, expect, it } from "vitest";
import { availability, darClock, isAvailableNow } from "@/lib/provider/availability";
import { AreaTier, areaTier, extractArea, parseSearchParams, queryTokens, searchHref, type AreaContext } from "@/lib/discovery/query";

// Thursday 24 Sep 2026, 10:00 in Dar es Salaam = 07:00 UTC.
const wed10 = new Date("2026-09-24T07:00:00Z");
const weekdays = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, opensAt: 8 * 60, closesAt: 17 * 60 }));

describe("availability (Dar es Salaam time)", () => {
  it("reads the Dar clock", () => {
    expect(darClock(wed10)).toEqual({ day: 4, minute: 600 }); // 24 Sep 2026 is a Thursday
    expect(darClock(new Date("2026-09-27T21:30:00Z"))).toEqual({ day: 1, minute: 30 }); // Sun 21:30 UTC = Mon 00:30 Dar
  });

  it("knows open, closed and when it opens next", () => {
    expect(availability("SCHEDULE", weekdays, wed10)).toEqual({ state: "OPEN", closesAt: 1020 });
    expect(availability("SCHEDULE", weekdays, new Date("2026-09-24T15:00:00Z"))).toEqual({ state: "CLOSED", opensAt: { day: 5, minute: 480 } });
    expect(availability("SCHEDULE", weekdays, new Date("2026-09-24T03:00:00Z"))).toEqual({ state: "CLOSED", opensAt: { day: 4, minute: 480 } });
    // Friday evening → next opening is Monday.
    expect(availability("SCHEDULE", weekdays, new Date("2026-09-25T16:00:00Z"))).toEqual({ state: "CLOSED", opensAt: { day: 1, minute: 480 } });
  });

  it("handles the other modes and missing hours without guessing", () => {
    expect(availability("ALWAYS_OPEN", [], wed10)).toEqual({ state: "ALWAYS" });
    expect(availability("BY_APPOINTMENT", [], wed10)).toEqual({ state: "APPOINTMENT" });
    expect(availability("SCHEDULE", [], wed10)).toEqual({ state: "UNKNOWN" });
    expect(isAvailableNow({ state: "APPOINTMENT" })).toBe(false);
    expect(isAvailableNow({ state: "UNKNOWN" })).toBe(false);
    expect(isAvailableNow({ state: "ALWAYS" })).toBe(true);
  });
});

describe("search params", () => {
  it("parses and sanitises", () => {
    expect(parseSearchParams({ q: "  fundi   AC ", area: "Mikocheni", open: "1", page: "3", category: "../etc" })).toEqual({
      q: "fundi AC",
      area: "mikocheni",
      category: null,
      service: null,
      openNow: true,
      priced: false,
      verified: false,
      sort: "best",
      page: 3,
      view: "list",
    });
    expect(parseSearchParams({ view: "map" }).view).toBe("map");
    expect(parseSearchParams({ verified: "1", sort: "top" })).toMatchObject({ verified: true, sort: "top" });
    expect(parseSearchParams({ sort: "cheapest" }).sort).toBe("best");
    expect(parseSearchParams({ view: "<script>" }).view).toBe("list");
    expect(parseSearchParams({ page: "-4" }).page).toBe(1);
    expect(parseSearchParams({ q: "x".repeat(500) }).q).toHaveLength(100);
    expect(parseSearchParams({ q: ["a", "b"] }).q).toBe("a");
  });

  it("builds clean URLs", () => {
    expect(searchHref({ q: "ac", area: "mikocheni", openNow: true, page: 1 })).toBe("/search?q=ac&area=mikocheni&open=1");
    expect(searchHref({ q: "ac", page: 2 }, { page: 1 })).toBe("/search?q=ac");
    expect(searchHref({})).toBe("/search");
  });
});

describe("queryTokens", () => {
  it("splits on whitespace and punctuation, drops filler words", () => {
    expect(queryTokens("Fundi wa  Bomba")).toEqual(["fundi", "bomba"]);
    expect(queryTokens("AC repair, in Masaki")).toEqual(["ac", "repair", "masaki"]);
    // Regression: the letter "s" must never act as a separator.
    expect(queryTokens("saluni sinza")).toEqual(["saluni", "sinza"]);
  });
});

describe("extractArea", () => {
  const areas = [
    { slug: "mbezi", name: "Mbezi" },
    { slug: "mbezi-beach", name: "Mbezi Beach" },
    { slug: "mikocheni", name: "Mikocheni" },
  ];
  it("pulls an area out of the text", () => {
    expect(extractArea("AC repair in Mikocheni", areas)).toEqual({ q: "AC repair", area: "mikocheni" });
    expect(extractArea("fundi bomba mikocheni", areas)).toEqual({ q: "fundi bomba", area: "mikocheni" });
    expect(extractArea("fundi Mbezi Beach", areas)).toEqual({ q: "fundi", area: "mbezi-beach" });
  });
  it("only matches whole words", () => {
    expect(extractArea("mikochenixyz cleaning", areas)).toEqual({ q: "mikochenixyz cleaning", area: null });
  });
});

describe("area tiers and ordering", () => {
  const ctx: AreaContext = {
    areaId: "mik",
    districtId: "kin",
    districtAreaIds: new Set(["mik", "mas"]),
    serveIds: new Set(["mik", "kin"]),
  };
  it("ranks based-in over serves over same district", () => {
    expect(areaTier({ primaryLocationId: "mik", serviceAreaIds: [] }, ctx)).toBe(AreaTier.InArea);
    expect(areaTier({ primaryLocationId: "far", serviceAreaIds: ["kin"] }, ctx)).toBe(AreaTier.ServesArea);
    expect(areaTier({ primaryLocationId: "mas", serviceAreaIds: [] }, ctx)).toBe(AreaTier.SameDistrict);
    expect(areaTier({ primaryLocationId: "far", serviceAreaIds: [] }, ctx)).toBe(AreaTier.Elsewhere);
  });
});
