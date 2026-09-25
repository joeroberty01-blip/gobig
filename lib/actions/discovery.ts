"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { AREA_COOKIE, POINT_COOKIE } from "@/lib/discovery/area";
import { encodePoint, inServiceRegion } from "@/lib/geo";

const cookieOptions = (maxAge: number) => ({
  path: "/",
  maxAge,
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
});

/** Remembers (or clears, with null) the customer's area. Choosing an area replaces a shared position. */
export async function setAreaAction(slug: string | null): Promise<void> {
  const jar = await cookies();
  jar.delete(POINT_COOKIE);
  if (!slug) {
    jar.delete(AREA_COOKIE);
    return;
  }
  const exists = await prisma.location.findFirst({
    where: { slug, isActive: true, type: { in: ["DISTRICT", "WARD", "NEIGHBOURHOOD"] } },
    select: { id: true },
  });
  if (!exists) return;
  jar.set(AREA_COOKIE, slug, cookieOptions(60 * 60 * 24 * 365));
}

/**
 * Stores the customer's device position, rounded to ~110 m, for one day. Only in their browser;
 * nothing is written to the database or logged. Positions outside Dar es Salaam are refused.
 */
export async function setPointAction(lat: number, lng: number): Promise<{ ok: true } | { ok: false; error: "outsideServiceArea" }> {
  const p = { lat: Number(lat), lng: Number(lng) };
  if (!inServiceRegion(p)) return { ok: false, error: "outsideServiceArea" };
  const jar = await cookies();
  jar.set(POINT_COOKIE, encodePoint(p), cookieOptions(60 * 60 * 24));
  jar.delete(AREA_COOKIE);
  return { ok: true };
}

export async function clearPointAction(): Promise<void> {
  (await cookies()).delete(POINT_COOKIE);
}
