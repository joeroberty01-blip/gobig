"use client";

import { CalendarCheck, Car, Globe, Mail, MessageSquare, Navigation, Phone, ReceiptText, type LucideIcon } from "lucide-react";
import type { ConnectAction } from "@/lib/provider/connect";

/** WhatsApp-style glyph: a chat bubble with a handset (drawn here, no brand asset needed). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 20.5 4.8 16.6A9 9 0 1 1 8 19.6Z" />
      <path d="M9.2 8.6c.2-.5.5-.6.8-.6h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c-.1.2-.1.4 0 .6.6 1 1.4 1.8 2.4 2.4.2.1.4.1.6 0l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.3.1.4.3.4.5v.5c0 .3-.1.6-.6.8-.8.4-1.8.4-2.7 0a9.8 9.8 0 0 1-4.8-4.8c-.4-.9-.4-1.9 0-2.7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const ACTION_ICON: Record<ConnectAction, LucideIcon | typeof WhatsAppIcon> = {
  CALL: Phone,
  WHATSAPP: WhatsAppIcon,
  MESSAGE: MessageSquare,
  REQUEST_QUOTE: ReceiptText,
  BOOK_SERVICE: CalendarCheck,
  BOOK_RIDE: Car,
  WEBSITE: Globe,
  EMAIL: Mail,
  DIRECTIONS: Navigation,
};

const EXTERNAL: ConnectAction[] = ["WEBSITE", "DIRECTIONS", "WHATSAPP", "BOOK_SERVICE", "BOOK_RIDE"];

/**
 * Fire-and-forget tap beacon. sendBeacon survives the page navigating away (tel:, wa.me…) and
 * never delays the tap. Failures are ignored: analytics must never get in the customer's way.
 */
export function trackConnect(provider: string, action: ConnectAction, source: "PROFILE" | "CARD" | "MAP") {
  try {
    const body = JSON.stringify({ provider, action, source });
    // text/plain keeps it a "simple" request (no preflight); the server parses the JSON itself.
    if (navigator.sendBeacon?.("/api/connect", new Blob([body], { type: "text/plain" }))) return;
  } catch {
    /* fall through */
  }
  void fetch("/api/connect", { method: "POST", body: JSON.stringify({ provider, action, source }), keepalive: true }).catch(() => undefined);
}

export function ConnectButton({
  slug,
  action,
  href,
  label,
  source,
  primary = false,
  iconOnly = false,
  className = "",
}: {
  slug: string;
  action: ConnectAction;
  href: string;
  label: string;
  source: "PROFILE" | "CARD" | "MAP";
  primary?: boolean;
  /** Round icon button (search result rows); the label becomes its accessible name. */
  iconOnly?: boolean;
  className?: string;
}) {
  const Icon = ACTION_ICON[action];
  const external = EXTERNAL.includes(action);
  // WhatsApp always wears its own green, so customers recognise it at a glance.
  const tone =
    action === "WHATSAPP"
      ? "bg-whatsapp text-white hover:opacity-90"
      : primary
        ? "bg-night-900 text-white hover:bg-night-700"
        : "border border-line bg-surface text-ink hover:bg-canvas";
  return (
    <a
      href={href}
      onClick={() => trackConnect(slug, action, source)}
      {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      {...(iconOnly ? { "aria-label": label, title: label } : {})}
      className={`flex items-center justify-center gap-2 text-sm font-semibold transition active:scale-[0.97] ${
        iconOnly ? "size-11 rounded-full" : "min-h-12 rounded-xl px-3 whitespace-nowrap"
      } ${tone} ${className}`}
    >
      <Icon aria-hidden className={iconOnly ? "size-5" : "size-4"} />
      {!iconOnly && label}
    </a>
  );
}
