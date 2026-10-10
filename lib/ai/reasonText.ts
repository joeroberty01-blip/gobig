import { fill } from "@/lib/i18n/dictionaries";
import type { PickReason } from "./recommend";

/** A recommendation reason in the reader's language (texts from the dictionary, never the model). */
export function reasonText(r: PickReason, text: Record<string, string>): string {
  if (r.code === "NEAR" || r.code === "CLOSEST") return fill(text[r.code]!, { km: r.km.toFixed(1) });
  if (r.code === "MOST_REVIEWS") return fill(text.MOST_REVIEWS!, { count: r.count });
  return text[r.code] ?? "";
}
