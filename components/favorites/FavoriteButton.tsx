"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "@/lib/actions/favorites";
import { useI18n } from "@/lib/i18n/I18nProvider";

/** Save/unsave on a profile. Guests get a link to log in and come back. */
export function FavoriteButton({ providerId, slug, initial, signedInCustomer }: { providerId: string; slug: string; initial: boolean; signedInCustomer: boolean }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const cls = "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold";

  if (!signedInCustomer) {
    return (
      <Link href={`/login?callbackUrl=${encodeURIComponent(`/p/${slug}`)}`} className={`${cls} border-line bg-surface text-ink`}>
        <Heart aria-hidden className="size-4" />
        {t.saved.save}
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
      className={`${cls} ${saved ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-surface text-ink"}`}
    >
      <Heart aria-hidden className={`size-4 ${saved ? "fill-current" : ""}`} />
      {saved ? t.saved.saved : t.saved.save}
    </button>
  );
}
