"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, SearchX, TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

/**
 * Error boundary body (Phase 14). Says what happened in plain words and offers a retry. The error
 * itself isn't shown to users; Next logs it on the server with its digest.
 */
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-16 text-center animate-rise">
      <span className="grid size-16 place-items-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert aria-hidden className="size-8" />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">{t.ui.states.errorTitle}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t.ui.states.errorBody}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-night-900 px-4 text-sm font-semibold text-white transition hover:bg-night-700 active:scale-[0.98]"
        >
          <RotateCcw aria-hidden className="size-4" />
          {t.ui.states.retry}
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold transition hover:bg-canvas">
          {t.ui.states.goHome}
        </Link>
      </div>
    </div>
  );
}

export function NotFoundView() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center animate-rise">
      <span className="grid size-16 place-items-center rounded-full bg-brand-50 text-brand-700">
        <SearchX aria-hidden className="size-8" />
      </span>
      <p className="mt-5 text-sm font-bold tracking-widest text-ink-subtle">404</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{t.ui.states.notFoundTitle}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t.ui.states.notFoundBody}</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-night-900 px-4 text-sm font-semibold text-white transition hover:bg-night-700 active:scale-[0.98]"
      >
        {t.ui.states.goHome}
      </Link>
    </div>
  );
}
