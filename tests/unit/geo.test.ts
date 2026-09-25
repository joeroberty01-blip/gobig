import { describe, expect, it } from "vitest";
import {
  customerPoint,
  decodePoint,
  distanceBand,
  distanceKm,
  encodePoint,
  formatDistance,
  inServiceRegion,
  nearestArea,
  publicPoint,
  snapApprox,
} from "@/lib/geo";
import { actionHref, isActionAvailable } from "@/lib/provider/connect";
import { locationSchema } from "@/lib/validators/provider";

// Real OSM centres (prisma/seeds/data/dar-area-coordinates.json).
const mikocheni = { lat: -6.7637, lng: 39.25425 };
const kariakoo = { lat: -6.82042, lng: 39.27581 };

describe("distance", () => {
  it("computes great-circle km", () => {
    // Mikocheni → Kariakoo is roughly 6.7 km as the crow flies.
    expect(distanceKm(mikocheni, kariakoo)).toBeGreaterThan(6.3);
    expect(distanceKm(mikocheni, kariakoo)).toBeLessThan(7.1);
    expect(distanceKm(mikocheni, mikocheni)).toBe(0);
  });
  it("bands distance so small differences don't dominate", () => {
    expect([0.5, 3, 7, 15, 40, null].map(distanceBand)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("region", () => {
  it("accepts Dar es Salaam and refuses elsewhere", () => {
    expect(inServiceRegion(mikocheni)).toBe(true);
    expect(inServiceRegion({ lat: -3.3869, lng: 36.683 })).toBe(false); // Arusha
    expect(inServiceRegion({ lat: 0, lng: 0 })).toBe(false);
    expect(inServiceRegion({ lat: NaN, lng: 39.2 })).toBe(false);
  });
});

describe("location privacy", () => {
  const pin = { lat: -6.763712, lng: 39.254287 };

  it("customer positions are kept to ~110 m", () => {
    expect(customerPoint(pin)).toEqual({ lat: -6.764, lng: 39.254 });
    expect(encodePoint(pin)).toBe("-6.764,39.254");
  });

  it("approximate points are snapped and stable (no triangulation from small moves)", () => {
    const a = snapApprox(pin);
    const b = snapApprox({ lat: pin.lat + 0.0008, lng: pin.lng - 0.0008 });
    expect(a).toEqual(b);
    expect(distanceKm(a, pin)).toBeLessThan(0.45);
    expect(a).not.toEqual(pin);
  });

  it("only EXACT reveals the pin; otherwise snapped or area centre", () => {
    expect(publicPoint("EXACT", pin, mikocheni)).toEqual({ point: pin, precision: "exact" });
    expect(publicPoint("APPROXIMATE", pin, mikocheni)).toEqual({ point: snapApprox(pin), precision: "approx" });
    expect(publicPoint("AREA_ONLY", pin, mikocheni)).toEqual({ point: mikocheni, precision: "area" });
    expect(publicPoint("EXACT", null, mikocheni)).toEqual({ point: mikocheni, precision: "area" });
    expect(publicPoint("AREA_ONLY", null, null)).toBeNull();
  });

  it("states distance no more precisely than the point allows", () => {
    expect(formatDistance(0.34, "exact")).toBe("0.3 km");
    expect(formatDistance(3.46, "exact")).toBe("3.5 km");
    expect(formatDistance(0.4, "approx")).toBe("~1 km");
    expect(formatDistance(3.46, "area")).toBe("~3 km");
  });

  it("decodes only well-formed, in-region cookie values", () => {
    expect(decodePoint("-6.764,39.254")).toEqual({ lat: -6.764, lng: 39.254 });
    for (const bad of ["", "abc", "-6.764", "1e3,2", "-3.38,36.68", "-6.764,39.254;evil"]) expect(decodePoint(bad)).toBeNull();
  });
});

describe("nearest area", () => {
  it("finds the closest centre within range", () => {
    const areas = [
      { slug: "mikocheni", lat: mikocheni.lat, lng: mikocheni.lng },
      { slug: "kariakoo", lat: kariakoo.lat, lng: kariakoo.lng },
      { slug: "unlocated", lat: null, lng: null },
    ];
    expect(nearestArea({ lat: -6.765, lng: 39.255 }, areas)?.slug).toBe("mikocheni");
    expect(nearestArea({ lat: -7.2, lng: 39.6 }, areas)).toBeNull();
  });
});

describe("directions", () => {
  const src = { phone: null, whatsapp: null, website: null, email: null, addressText: null, areaName: "Mikocheni" };
  it("uses the pin only when the location is public", () => {
    expect(isActionAvailable("DIRECTIONS", { ...src, locationVisibility: "EXACT", latitude: -6.76, longitude: 39.25 })).toBe(true);
    expect(actionHref("DIRECTIONS", { ...src, locationVisibility: "EXACT", latitude: -6.76, longitude: 39.25 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-6.76,39.25",
    );
    expect(isActionAvailable("DIRECTIONS", { ...src, locationVisibility: "APPROXIMATE", latitude: -6.76, longitude: 39.25 })).toBe(false);
  });
});

describe("location validation", () => {
  const ok = { locationId: "x", addressText: "", visibility: "AREA_ONLY" as const };
  it("accepts a pin in Dar and rounds it", () => {
    expect(locationSchema.parse({ ...ok, latitude: -6.7637123456, longitude: 39.2542789, radiusKm: 5 })).toMatchObject({ latitude: -6.76371, longitude: 39.25428, radiusKm: 5 });
  });
  it("rejects pins outside the service region or half-set", () => {
    expect(locationSchema.safeParse({ ...ok, latitude: -3.38, longitude: 36.68 }).error?.issues[0]?.message).toBe("pinOutsideArea");
    expect(locationSchema.safeParse({ ...ok, latitude: -6.76 }).error?.issues[0]?.message).toBe("pinOutsideArea");
  });
  it("needs something exact to show when EXACT is chosen", () => {
    expect(locationSchema.safeParse({ ...ok, visibility: "EXACT" }).error?.issues[0]?.message).toBe("exactNeedsLocation");
    expect(locationSchema.safeParse({ ...ok, visibility: "EXACT", addressText: "Plot 12" }).success).toBe(true);
  });
  it("treats 'approximate' without a pin as area-only", () => {
    expect(locationSchema.parse({ ...ok, visibility: "APPROXIMATE" }).visibility).toBe("AREA_ONLY");
  });
  it("only allows the offered radius values", () => {
    expect(locationSchema.safeParse({ ...ok, radiusKm: 7 }).success).toBe(false);
    expect(locationSchema.safeParse({ ...ok, radiusKm: 500 }).success).toBe(false);
  });
});
