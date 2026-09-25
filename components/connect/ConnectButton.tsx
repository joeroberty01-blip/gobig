"use client";

import { CalendarCheck, Car, Globe, Mail, MessageCircle, MessageSquare, Navigation, Phone, ReceiptText, type LucideIcon } from "lucide-react";
import type { ConnectAction } from "@/lib/provider/connect";

export const ACTION_ICON: Record<ConnectAction, LucideIcon> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
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
  className = "",
}: {
  slug: string;
  action: ConnectAction;
  href: string;
  label: string;
  source: "PROFILE" | "CARD" | "MAP";
  primary?: boolean;
  className?: string;
}) {
  const Icon = ACTION_ICON[action];
  const external = EXTERNAL.includes(action);
  return (
    <a
      href={href}
      onClick={() => trackConnect(slug, action, source)}
      {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ${
        primary ? "bg-brand-700 text-white" : "border border-line bg-surface text-ink"
      } ${className}`}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </a>
  );
}
