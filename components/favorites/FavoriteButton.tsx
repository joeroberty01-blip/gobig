"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "@/lib/actions/favorites";
import { useI18n } from "@/lib/i18n/I18nProvider";

/** Save/unsave on a profile. Guests get a link to log in and come back. */
export function FavoriteButton({
  providerId,
  slug,
  initial,
  signedInCustomer,
  round = false,
  small = false,
}: {
  providerId: string;
  slug: string;
  initial: boolean;
  signedInCustomer: boolean;
  /** Round icon button over the cover photo (Phase 14); the label stays as its accessible name. */
  round?: boolean;
  /** Smaller round button for the photo cards. */
  small?: boolean;
}) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const cls = round
    ? `grid place-items-center rounded-full border shadow-soft backdrop-blur transition active:scale-95 [&>span]:sr-only ${small ? "size-8 [&>svg]:size-4" : "size-11"}`
    : "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition active:scale-[0.98]";

  if (!signedInCustomer) {
    return (
      <Link href={`/login?callbackUrl=${encodeURIComponent(`/p/${slug}`)}`} className={`${cls} border-line bg-surface/90 text-ink`}>
        <Heart aria-hidden className={round ? "size-5" : "size-4"} />
        <span>{t.saved.save}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !saved;
          setSaved(next);
          const r = await toggleFavoriteAction(providerId, next);
          if (!r.ok) setSaved(!next);
        })
      }
      className={`${cls} ${saved ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-surface/90 text-ink"}`}
    >
      <Heart aria-hidden className={`${round ? "size-5" : "size-4"} ${saved ? "fill-current" : ""}`} />
      <span>{saved ? t.saved.saved : t.saved.save}</span>
    </button>
  );
}
