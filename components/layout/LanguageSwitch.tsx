"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/lib/actions/auth";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n/dictionaries";

export function LanguageSwitch() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  };

  return (
    <div role="group" aria-label={t.common.language} className="flex rounded-lg border border-line bg-surface p-0.5 text-xs font-semibold">
      {(["sw", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          disabled={pending}
          aria-pressed={locale === l}
          lang={l}
          title={l === "sw" ? t.common.swahili : t.common.english}
          className={`min-h-8 min-w-9 rounded-md px-2 uppercase ${locale === l ? "bg-action text-white" : "text-ink-muted"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
