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
}: {
  districts: AreaOption[];
  value: string | null;
  search?: Partial<SearchParams>;
  compact?: boolean;
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
    <label className={`flex items-center gap-2 rounded-xl border border-line bg-surface px-3 ${compact ? "min-h-10" : "min-h-12"} ${pending ? "opacity-60" : ""}`}>
      <MapPin aria-hidden className="size-4 shrink-0 text-brand-700" />
      <span className="sr-only">{t.discovery.yourArea}</span>
      <select
        value={value ?? ""}
        onChange={(e) => choose(e.target.value)}
        disabled={pending}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium focus:outline-none"
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
