// Pure helpers for provider data: no database, no framework. Unit-tested in tests/unit.

export type PriceType = "FIXED" | "FROM" | "RANGE" | "HOURLY" | "ON_QUOTE";

export const MAX_PRICE_TZS = 1_000_000_000;

/** "TSh 25,000". TZS is shown without decimals. */
export function formatTzs(amount: number): string {
  return `TSh ${Math.round(amount).toLocaleString("en-US")}`;
}

export type PriceLabels = {
  askForPrice: string;
  from: string; // "From {amount}"
  perHour: string; // "{amount} / hour"
};

/**
 * Human price for a provider service. Returns the "ask for price" label whenever an amount the
 * type needs is missing — a price is never guessed (ADR-005).
 */
export function formatPrice(
  p: { priceType: PriceType; priceMin: number | null; priceMax: number | null; priceUnit?: string | null },
  labels: PriceLabels,
): string {
  const unit = p.priceUnit ? ` ${p.priceUnit}` : "";
  switch (p.priceType) {
    case "FIXED":
      return p.priceMin != null ? `${formatTzs(p.priceMin)}${unit}` : labels.askForPrice;
    case "FROM":
      return p.priceMin != null ? `${labels.from.replace("{amount}", formatTzs(p.priceMin))}${unit}` : labels.askForPrice;
    case "RANGE":
      return p.priceMin != null && p.priceMax != null
        ? `${formatTzs(p.priceMin)} – ${p.priceMax.toLocaleString("en-US")}${unit}`
        : labels.askForPrice;
    case "HOURLY":
      return p.priceMin != null ? labels.perHour.replace("{amount}", formatTzs(p.priceMin)) : labels.askForPrice;
    default:
      return labels.askForPrice;
  }
}

/** Minutes from midnight → "HH:MM". 1440 → "24:00". */
export function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:MM" → minutes from midnight, or null. "24:00" is allowed as a closing time. */
export function timeToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** Adds https:// when missing and only accepts http(s) URLs with a real-looking host. */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!/^[^.\s]+(\.[^.\s]+)+$/.test(url.hostname) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type SocialPlatform = "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "X" | "YOUTUBE" | "LINKEDIN";

const SOCIAL_HOSTS: Record<SocialPlatform, string[]> = {
  FACEBOOK: ["facebook.com", "fb.com", "fb.me"],
  INSTAGRAM: ["instagram.com"],
  TIKTOK: ["tiktok.com"],
  X: ["x.com", "twitter.com"],
  YOUTUBE: ["youtube.com", "youtu.be"],
  LINKEDIN: ["linkedin.com"],
};

const HANDLE_URL: Partial<Record<SocialPlatform, (h: string) => string>> = {
  INSTAGRAM: (h) => `https://www.instagram.com/${h}`,
  TIKTOK: (h) => `https://www.tiktok.com/@${h}`,
  X: (h) => `https://x.com/${h}`,
};

/**
 * Accepts a profile URL on the platform's own domain, or an @handle for platforms where the
 * handle maps to a URL. Links to any other domain are refused, so a "social link" can't be used
 * to send customers somewhere unexpected.
 */
export function normalizeSocial(platform: SocialPlatform, raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const handle = /^@?([A-Za-z0-9._]{2,30})$/.exec(v);
  if (handle && HANDLE_URL[platform]) return HANDLE_URL[platform]!(handle[1]!);

  const url = normalizeWebsite(v);
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^(www\.|m\.)/, "");
  if (!SOCIAL_HOSTS[platform].some((h) => host === h || host.endsWith(`.${h}`))) return null;
  return url.replace(/^http:/, "https:");
}

/** URL-safe slug from a business name; Swahili/English names are plain Latin script. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "provider";
}
