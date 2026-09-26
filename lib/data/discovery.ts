import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { memo, REFERENCE_TTL_MS } from "@/lib/cache";
import { getSavedArea, getSavedPoint } from "@/lib/discovery/area";
import type { Point } from "@/lib/geo";
import { parseSearchParams, type SearchParams } from "@/lib/discovery/query";

export const getAreaPickerOptions = cache(() =>
  memo("ref:areaPicker", REFERENCE_TTL_MS, () =>
    prisma.location.findMany({
      where: { type: "DISTRICT", isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, children: { where: { isActive: true }, orderBy: { name: "asc" }, select: { slug: true, name: true } } },
    }),
  ),
);

/**
 * Search params plus the location actually applied: an explicit `area` in the URL wins; "all"
 * means everywhere (no area, no position); otherwise the customer's saved area, or their shared
 * position (the two are mutually exclusive — choosing one clears the other).
 */
export async function resolveSearchParams(raw: Record<string, string | string[] | undefined>): Promise<{
  params: SearchParams;
  effective: SearchParams;
  point: Point | null;
}> {
  const params = parseSearchParams(raw);
  if (params.area === "all") return { params, effective: { ...params, area: null }, point: null };
  if (params.area) return { params, effective: params, point: null };
  const [area, point] = await Promise.all([getSavedArea(), getSavedPoint()]);
  return { params, effective: { ...params, area: point ? null : area }, point };
}
