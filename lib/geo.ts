// Location maths for the location engine (Phase 4). Pure — no database, no framework.

export type Point = { lat: number; lng: number };

/** Where Go Big operates today: Dar es Salaam with a margin. Points outside are refused. */
export const SERVICE_REGION = { minLat: -7.35, maxLat: -6.4, minLng: 38.85, maxLng: 39.7 };
export const DAR_CENTER: Point = { lat: -6.7924, lng: 39.2083 };

export function inServiceRegion(p: Point): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= SERVICE_REGION.minLat &&
    p.lat <= SERVICE_REGION.maxLat &&
    p.lng >= SERVICE_REGION.minLng &&
    p.lng <= SERVICE_REGION.maxLng
  );
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function round(p: Point, decimals: number): Point {
  const f = 10 ** decimals;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

/** Customer positions are kept to 3 decimals (~110 m): enough to rank, not enough to pinpoint a home. */
export const customerPoint = (p: Point) => round(p, 3);

/**
 * Snaps a point to a ~550 m grid. Used for providers who chose "approximate": the public point
 * never moves with small changes, so repeated distance readings can't be used to triangulate
 * their exact position.
 */
export function snapApprox(p: Point): Point {
  const step = 0.005;
  return { lat: Number((Math.round(p.lat / step) * step).toFixed(3)), lng: Number((Math.round(p.lng / step) * step).toFixed(3)) };
}

export type Precision = "exact" | "approx" | "area";

/**
 * The only position of a provider that may leave the server (ADR-006):
 * EXACT → their pin; APPROXIMATE → snapped pin; AREA_ONLY (or no pin) → their area's centre.
 */
export function publicPoint(
  visibility: "EXACT" | "APPROXIMATE" | "AREA_ONLY",
  pin: Point | null,
  areaCentre: Point | null,
): { point: Point; precision: Precision } | null {
  if (pin && visibility === "EXACT") return { point: pin, precision: "exact" };
  if (pin && visibility === "APPROXIMATE") return { point: snapApprox(pin), precision: "approx" };
  if (areaCentre) return { point: areaCentre, precision: "area" };
  return null;
}

/** How precisely a distance may be stated, given how precise the provider's public point is. */
export function formatDistance(km: number, precision: Precision): string {
  if (precision === "exact") return km < 1 ? `${Math.max(0.1, Math.round(km * 10) / 10)} km` : `${Math.round(km * 10) / 10} km`;
  // Approximate/area points: whole km with "~", never below 1 km (would imply precision we don't have).
  return km < 1.5 ? "~1 km" : `~${Math.round(km)} km`;
}

/** Distance bands for ranking: small differences in km shouldn't outweigh availability. */
export function distanceBand(km: number | null): number {
  if (km == null) return 5;
  if (km <= 2) return 0;
  if (km <= 5) return 1;
  if (km <= 10) return 2;
  if (km <= 20) return 3;
  return 4;
}

/** Nearest located area to a point, if one is within `maxKm`. */
export function nearestArea<T extends { lat: number | null; lng: number | null }>(p: Point, areas: T[], maxKm = 5): (T & { km: number }) | null {
  let best: (T & { km: number }) | null = null;
  for (const a of areas) {
    if (a.lat == null || a.lng == null) continue;
    const km = distanceKm(p, { lat: a.lat, lng: a.lng });
    if (km <= maxKm && (!best || km < best.km)) best = { ...a, km };
  }
  return best;
}

/** "lat,lng" cookie value ↔ Point. */
export function encodePoint(p: Point): string {
  const r = customerPoint(p);
  return `${r.lat},${r.lng}`;
}

export function decodePoint(v: string | null | undefined): Point | null {
  if (!v) return null;
  const m = /^(-?\d{1,2}\.\d{1,6}),(-?\d{1,3}\.\d{1,6})$/.exec(v);
  if (!m) return null;
  const p = { lat: Number(m[1]), lng: Number(m[2]) };
  return inServiceRegion(p) ? p : null;
}
