"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { THEME_COOKIE, type ThemeChoice } from "@/lib/theme";

/** Applies a theme to the page at once and remembers it for a year ("system" forgets the choice). */
function applyTheme(next: ThemeChoice) {
  const root = document.documentElement;
  if (next === "system") {
    root.removeAttribute("data-theme");
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.setAttribute("data-theme", next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }
}

/** Device / light / dark. */
export function ThemeSwitch({ initial }: { initial: ThemeChoice }) {
  const { t } = useI18n();
  const [choice, setChoice] = useState(initial);

  const options = [
    { value: "system", label: t.ui.theme.system, Icon: Monitor },
    { value: "light", label: t.ui.theme.light, Icon: Sun },
    { value: "dark", label: t.ui.theme.dark, Icon: Moon },
  ] as const;

  return (
    <div role="radiogroup" aria-label={t.ui.theme.label} className="inline-flex rounded-xl border border-line bg-canvas p-1">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          onClick={() => {
            setChoice(value);
            applyTheme(value);
          }}
          className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${
            choice === value ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink"
          }`}
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
