"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { parseSearchParams } from "@/lib/discovery/query";
import { searchProviders } from "@/lib/services/discovery";
import { resetWeights, saveWeights } from "@/lib/services/ranking";
import type { Signal } from "@/lib/ranking/engine";
import { previewSchema, weightsSchema } from "@/lib/validators/ranking";

// Phase 8 admin actions: authenticate → can("ranking:configure") → validate → service (audited).

type ErrorKey = keyof Dictionary["errors"];
type Fail = { ok: false; error: ErrorKey; field?: string };

function invalid(error: z.ZodError): Fail {
  const issue = error.issues[0];
  return { ok: false, error: (issue?.message as ErrorKey) ?? "generic", field: issue?.path.map(String).join(".") };
}

function refresh() {
  revalidatePath("/admin/ranking");
  revalidatePath("/search");
  revalidatePath("/");
}

export async function saveRankingAction(input: z.input<typeof weightsSchema>): Promise<{ ok: true } | Fail> {
  const user = await getCurrentUser();
  if (!can(user, "ranking:configure")) return { ok: false, error: "forbidden" };
  const parsed = weightsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await saveWeights(user!.id, parsed.data);
  refresh();
  return { ok: true };
}

export async function resetRankingAction(): Promise<{ ok: true } | Fail> {
  const user = await getCurrentUser();
  if (!can(user, "ranking:configure")) return { ok: false, error: "forbidden" };
  await resetWeights(user!.id);
  refresh();
  return { ok: true };
}

export type PreviewRow = { id: string; slug: string; name: string; score: number; breakdown: Record<Signal, number> };

/** Runs a real search with draft weights (nothing saved) and returns the first 10 with their scores. */
export async function previewRankingAction(input: z.input<typeof previewSchema>): Promise<{ ok: true; rows: PreviewRow[]; total: number } | Fail> {
  const user = await getCurrentUser();
  if (!can(user, "ranking:configure")) return { ok: false, error: "forbidden" };
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { q, service, area, weights } = parsed.data;
  const params = { ...parseSearchParams({}), q, service, area };
  const result = await searchProviders(params, new Date(), null, { weights, explain: true });
  const rows = result.results.slice(0, 10).map((c) => {
    const e = result.explain!.get(c.id)!;
    return { id: c.id, slug: c.slug, name: c.name, score: e.score, breakdown: e.breakdown };
  });
  return { ok: true, rows, total: result.total };
}
