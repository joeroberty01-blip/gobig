import "server-only";
import { cookies } from "next/headers";
import { decodePoint, type Point } from "@/lib/geo";

// The customer's chosen area (a Location slug) and, if they allowed it, their device position.
// Both live only in cookies on the customer's own browser — never in the database (ADR-006).

export const AREA_COOKIE = "gobig_area";
export const POINT_COOKIE = "gobig_point";

export async function getSavedArea(): Promise<string | null> {
  const v = (await cookies()).get(AREA_COOKIE)?.value;
  return v && /^[a-z0-9-]{1,80}$/.test(v) ? v : null;
}

/** Rounded (~110 m) device position, if the customer shared it. */
export async function getSavedPoint(): Promise<Point | null> {
  return decodePoint((await cookies()).get(POINT_COOKIE)?.value);
}
