"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, X } from "lucide-react";
import { clearPointAction, setPointAction } from "@/lib/actions/discovery";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";

/**
 * Asks the browser for the customer's position only when they tap the button (never on page
 * load), sends it rounded to the server, which keeps it in an httpOnly cookie for a day.
 */
export function LocateMe({ active, areaName, onDark = false }: { active: boolean; areaName: string | null; onDark?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tone = onDark ? "text-white/70" : "text-ink-muted";

  const locate = () => {
    setError(null);
    if (!("geolocation" in navigator)) return setError(t.location.locationUnavailable);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        start(async () => {
          const r = await setPointAction(pos.coords.latitude, pos.coords.longitude);
          if (!r.ok) setError(r.error === "rateLimited" ? t.errors.rateLimited : t.location.outsideServiceArea);
          router.refresh();
        });
      },
      (err) => {
        setLocating(false);
        setError(err.code === err.PERMISSION_DENIED ? t.location.locationDenied : t.location.locationUnavailable);
      },
      // Coarse is enough to rank nearby providers and saves battery; accept a 5-minute-old fix.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const forget = () =>
    start(async () => {
      await clearPointAction();
      router.refresh();
    });

  if (active) {
    return (
      <div className={`flex items-center gap-2 text-sm ${tone}`}>
        <LocateFixed aria-hidden className="size-4 shrink-0" />
        <span className="font-medium">{areaName ? fill(t.location.nearArea, { area: areaName }) : t.location.usingYourLocation}</span>
        <button type="button" onClick={forget} disabled={pending} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold underline">
          <X aria-hidden className="size-3.5" />
          {t.location.forgetLocation}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={locate}
        disabled={locating || pending}
        className={`inline-flex min-h-9 w-fit items-center gap-1.5 rounded-xl px-1 text-xs font-semibold sm:text-sm ${onDark ? "text-accent-400" : "text-link"}`}
      >
        <LocateFixed aria-hidden className="size-4" />
        {locating || pending ? t.location.locating : t.location.useMyLocation}
      </button>
      {error ? (
        <p role="alert" className={`text-xs ${onDark ? "text-accent-400" : "text-danger"}`}>
          {error}
        </p>
      ) : (
        <details className={`text-xs leading-snug ${tone}`}>
          <summary className="cursor-pointer list-none">
            {t.location.locationPrivacyShort} <span className="font-semibold underline">{t.location.locationPrivacyWhy}</span>
          </summary>
          <p className="mt-1">{t.location.locationPrivacyNote}</p>
        </details>
      )}
    </div>
  );
}
