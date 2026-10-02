import "server-only";
import { createHash } from "node:crypto";
import type { ProviderCard } from "@/lib/services/discovery";
import type { SearchIntent } from "@/lib/ai/intent";
import { claudeRecommend } from "@/lib/ai/claude";
import { askedFrom, candidateLine, MAX_CANDIDATES, rulePicks, verifyPicks, type Recommendation } from "@/lib/ai/recommend";

// Go Big AI recommendations. The candidates are always the live search results (fresh facts from
// the database on every question), so Go Big AI "knows" every business as soon as its profile,
// prices, hours, reviews or badges change — nothing is trained or copied elsewhere.

const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; picks: { id: string; reasons: string[] }[] | null }>();

export async function recommendProviders(question: string, intent: SearchIntent, results: ProviderCard[], opts: { useAi?: boolean } = {}): Promise<Recommendation | null> {
  const candidates = results.slice(0, MAX_CANDIDATES);
  if (!candidates.length) return null;
  const asked = askedFrom(intent);
  if (candidates.length === 1 || opts.useAi === false || intent.source !== "ai") return { picks: rulePicks(candidates, asked), source: "rules" };

  // Same question over the same businesses → same choice for 10 minutes. Facts are re-checked anyway.
  const key = createHash("sha256")
    .update(`${question.toLowerCase()}\u0000${candidates.map((c) => c.id).join(",")}\u0000${intent.area ?? ""}`)
    .digest("base64url");
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_MS) {
    const note = `service=${intent.service ?? intent.category ?? "unclear"}, area=${intent.area ?? "not given"}, timing=${intent.timing}, urgency=${intent.urgency}`;
    const picks = await claudeRecommend(question, note, candidates.map((c) => candidateLine(c, candidates, asked)), candidates.map((c) => c.id));
    hit = { at: Date.now(), picks };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, hit);
  }
  const verified = hit.picks ? verifyPicks(hit.picks, candidates, asked) : null;
  if (hit.picks && hit.picks.length === 0) return null; // the AI said none of them fit the question
  return verified ? { picks: verified, source: "ai" } : { picks: rulePicks(candidates, asked), source: "rules" };
}

export function _clearRecommendCache() {
  cache.clear();
}
