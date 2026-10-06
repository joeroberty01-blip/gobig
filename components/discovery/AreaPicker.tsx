"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { setAreaAction } from "@/lib/actions/discovery";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { searchHref, type SearchParams } from "@/lib/discovery/query";

export type AreaOption = { slug: string; name: string; children: { slug: string; name: string }[] };

/**
 * Area chooser. Remembers the choice (cookie) and refreshes. On the search page (`search` given)
 * it also updates the URL, using "all" to mean "no area" so the saved area isn't re-applied.
 */
export function AreaPicker({
  districts,
  value,
  search,
  compact = false,
  pill = false,
}: {
  districts: AreaOption[];
  value: string | null;
  search?: Partial<SearchParams>;
  compact?: boolean;
  /** The small "Dar es Salaam ▾" pill in the header (approved design). */
  pill?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  const choose = (slug: string) =>
    start(async () => {
      await setAreaAction(slug || null);
      if (search) router.push(searchHref(search, { area: slug || "all", page: 1 }));
      router.refresh();
    });

  return (
    // `relative`: the screen-reader label below is absolutely positioned; keep it inside.
    <label
      className={`relative flex items-center text-ink ${
        pill
          ? "min-h-9 min-w-0 max-w-32 gap-1 rounded-full bg-surface/80 px-2.5 hover:bg-surface sm:max-w-44"
          : `gap-2 rounded-xl border border-line bg-surface px-3 shadow-soft ${compact ? "min-h-10" : "min-h-12"}`
      } ${pending ? "opacity-60" : ""}`}
    >
      <MapPin aria-hidden className={`shrink-0 ${pill ? "size-3.5 text-ink-muted" : "size-4 text-brand-700"}`} />
      <span className="sr-only">{t.discovery.yourArea}</span>
      <select
        value={value ?? ""}
        onChange={(e) => choose(e.target.value)}
        disabled={pending}
        className={`min-w-0 flex-1 bg-transparent py-2 font-medium focus:outline-none ${pill ? "text-xs" : "text-sm"}`}
      >
        <option value="">{t.discovery.allOfDar}</option>
        {districts.map((d) => (
          <optgroup key={d.slug} label={d.name}>
            <option value={d.slug}>{fill(t.profile.fields.wholeDistrict, { district: d.name })}</option>
            {d.children.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
