import { MessageCircle, Phone } from "lucide-react";
import type { Locale } from "@/lib/i18n/dictionaries";
import { deskText } from "@/lib/i18n/desk";
import { normalizePhone } from "@/lib/phone";

/**
 * "Chat with Go Big on WhatsApp" (design wave 2: never a dead end). Renders nothing until an admin
 * sets the desk number in Platform settings, so it never points at a made-up number. The search
 * words, if any, are pre-filled; nothing else about the visitor goes in the link.
 */
export function DeskWhatsApp({ number, locale, query, className = "" }: { number: string | null; locale: Locale; query?: string; className?: string }) {
  const n = normalizePhone(number);
  if (!n) return null;
  const d = deskText(locale);
  const q = query?.trim().slice(0, 120);
  const text = q ? d.messageWithQuery.replace("{q}", q) : d.message;
  return (
    <a
      href={`https://wa.me/${n}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 text-sm font-semibold text-white shadow-soft transition hover:opacity-90 active:scale-[0.98] ${className}`}
    >
      <MessageCircle aria-hidden className="size-4" />
      {d.whatsapp}
    </a>
  );
}

/** "Call Go Big" — only when the desk phone is set. */
export function DeskCall({ number, locale, className = "" }: { number: string | null; locale: Locale; className?: string }) {
  const n = normalizePhone(number);
  if (!n) return null;
  return (
    <a
      href={`tel:+${n}`}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink shadow-soft transition hover:bg-canvas active:scale-[0.98] ${className}`}
    >
      <Phone aria-hidden className="size-4" />
      {deskText(locale).call}
    </a>
  );
}
