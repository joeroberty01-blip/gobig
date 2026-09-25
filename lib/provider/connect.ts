// Which contact buttons a provider can switch on, and where each one goes (Phases 2 & 6).
// Pure — shared by the server (which builds every link) and tests. A button is only ever offered
// when the data behind it exists; nothing is invented to fill a button.

export type ConnectAction =
  | "CALL"
  | "WHATSAPP"
  | "WEBSITE"
  | "EMAIL"
  | "DIRECTIONS"
  | "BOOK_SERVICE"
  | "BOOK_RIDE"
  | "REQUEST_QUOTE"
  | "MESSAGE";

/** Canonical display order. */
export const CONNECT_ACTIONS: readonly ConnectAction[] = [
  "CALL",
  "WHATSAPP",
  "MESSAGE",
  "REQUEST_QUOTE",
  "BOOK_SERVICE",
  "BOOK_RIDE",
  "WEBSITE",
  "EMAIL",
  "DIRECTIONS",
];

export type ConnectSource = {
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  email: string | null;
  bookingUrl?: string | null;
  rideUrl?: string | null;
  addressText: string | null;
  /** Map pin — only ever passed in when the provider chose EXACT visibility. */
  latitude?: number | null;
  longitude?: number | null;
  locationVisibility: "EXACT" | "APPROXIMATE" | "AREA_ONLY";
  areaName: string | null;
};

export function isActionAvailable(action: ConnectAction, s: ConnectSource): boolean {
  switch (action) {
    case "CALL":
    case "MESSAGE":
      return !!s.phone;
    case "WHATSAPP":
      return !!s.whatsapp;
    case "WEBSITE":
      return !!s.website;
    case "EMAIL":
      return !!s.email;
    case "BOOK_SERVICE":
      return !!s.bookingUrl;
    case "BOOK_RIDE":
      return !!s.rideUrl;
    case "REQUEST_QUOTE":
      // Phase 7: a direct service request inside GO BIG — needs no contact details.
      return true;
    case "DIRECTIONS":
      return s.locationVisibility === "EXACT" && (!!s.addressText || (s.latitude != null && s.longitude != null));
  }
}

/** "via GO BIG" opener for prefilled messages, so providers know where the customer came from. */
export function openerText(locale: "sw" | "en", providerName: string): string {
  return locale === "sw" ? `Habari ${providerName}, nimekupata kupitia GO BIG.` : `Hello ${providerName}, I found you on GO BIG.`;
}

/**
 * Link for a button. Phone numbers are stored as international digits (2557…). REQUEST_QUOTE links
 * to the in-app request form for one provider — see requestQuoteHref().
 */
export function actionHref(action: ConnectAction, s: ConnectSource, opener?: string): string | null {
  if (!isActionAvailable(action, s)) return null;
  const text = opener ? encodeURIComponent(opener) : null;
  switch (action) {
    case "CALL":
      return `tel:+${s.phone}`;
    case "MESSAGE":
      return text ? `sms:+${s.phone}?body=${text}` : `sms:+${s.phone}`;
    case "WHATSAPP":
      return text ? `https://wa.me/${s.whatsapp}?text=${text}` : `https://wa.me/${s.whatsapp}`;
    case "WEBSITE":
      return s.website;
    case "EMAIL":
      return `mailto:${s.email}`;
    case "BOOK_SERVICE":
      return s.bookingUrl ?? null;
    case "BOOK_RIDE":
      return s.rideUrl ?? null;
    case "REQUEST_QUOTE":
      return null; // needs the provider slug: requestQuoteHref()
    case "DIRECTIONS": {
      // A map pin gives turn-by-turn directions; otherwise search the written address.
      if (s.latitude != null && s.longitude != null) {
        return `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`;
      }
      const q = [s.addressText, s.areaName, "Dar es Salaam"].filter(Boolean).join(", ");
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    }
  }
}

/** Keeps only actions that are both chosen and currently possible, in canonical order. */
export function visibleActions(enabled: readonly ConnectAction[], s: ConnectSource): ConnectAction[] {
  return CONNECT_ACTIONS.filter((a) => enabled.includes(a) && isActionAvailable(a, s));
}

/** The Request Quote button: a service request sent only to this provider (Phase 7). */
export function requestQuoteHref(slug: string): string {
  return `/requests/new?provider=${encodeURIComponent(slug)}`;
}
