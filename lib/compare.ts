// Compare providers (Phase 15, requested for the customer journey). The selection is just a list
// of profile slugs: kept in the visitor's browser while choosing, and in the /compare URL so a
// comparison can be shared. Nothing is stored on the server.

export const MAX_COMPARE = 3;
export const COMPARE_STORAGE_KEY = "gobig_compare";
export const COMPARE_EVENT = "gobig:compare";

const SLUG = /^[a-z0-9-]{1,80}$/;

/** `?p=a,b,c` → up to three distinct, well-formed slugs; anything else is dropped. */
export function parseCompareSlugs(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const out: string[] = [];
  for (const part of value.split(",")) {
    const slug = part.trim().toLowerCase();
    if (SLUG.test(slug) && !out.includes(slug)) out.push(slug);
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

export function compareHref(slugs: string[]): string {
  return `/compare?p=${slugs.slice(0, MAX_COMPARE).join(",")}`;
}
