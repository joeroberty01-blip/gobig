"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { saveCategoryAction, saveServicesAction } from "@/lib/actions/provider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill } from "@/lib/i18n/dictionaries";
import { Input } from "@/components/ui";
import { FormError, StepActions, useLocalizedName, useStepSubmit, type StepProps } from "./shared";

type Named = { id: string; nameEn: string; nameSw: string };
export type CategoryOption = Named & { children: Named[] };
export type ServiceGroup = Named & { parentId: string | null; services: Named[] };

export function CategoryStep(props: StepProps & { options: CategoryOption[]; initial: string | null }) {
  const name = useLocalizedName();
  const [selected, setSelected] = useState(props.initial);
  const initialParent = props.options.find((o) => o.id === props.initial || o.children.some((c) => c.id === props.initial))?.id ?? null;
  const [open, setOpen] = useState<string | null>(initialParent);
  const { submit, pending, error, stepArg } = useStepSubmit(props);

  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), selected && submit(() => saveCategoryAction({ categoryId: selected }, stepArg)))} className="flex flex-col gap-4">
      <FormError error={error} />
      <ul className="flex flex-col gap-2" role="radiogroup">
        {props.options.map((cat) => {
          const hasChildren = cat.children.length > 0;
          const active = selected === cat.id || cat.children.some((c) => c.id === selected);
          return (
            <li key={cat.id} className={`rounded-2xl border bg-surface ${active ? "border-brand-500" : "border-line"}`}>
              <button
                type="button"
                role={hasChildren ? undefined : "radio"}
                aria-checked={hasChildren ? undefined : selected === cat.id}
                aria-expanded={hasChildren ? open === cat.id : undefined}
                onClick={() => (hasChildren ? setOpen(open === cat.id ? null : cat.id) : setSelected(cat.id))}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left font-medium"
              >
                {name(cat)}
                {hasChildren ? (
                  <ChevronDown aria-hidden className={`size-5 text-ink-subtle transition ${open === cat.id ? "rotate-180" : ""}`} />
                ) : (
                  selected === cat.id && <Check aria-hidden className="size-5 text-brand-700" />
                )}
              </button>
              {hasChildren && open === cat.id && (
                <ul className="flex flex-col gap-1 border-t border-line p-2">
                  {cat.children.map((child) => (
                    <li key={child.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected === child.id}
                        onClick={() => setSelected(child.id)}
                        className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm ${
                          selected === child.id ? "bg-brand-50 font-semibold text-brand-900" : "hover:bg-canvas"
                        }`}
                      >
                        {name(child)}
                        {selected === child.id && <Check aria-hidden className="size-4 text-brand-700" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <StepActions {...props} pending={pending} disabled={!selected} />
    </form>
  );
}

export function ServicesStep(props: StepProps & { groups: ServiceGroup[]; primaryCategoryId: string | null; initial: string[] }) {
  const { t } = useI18n();
  const name = useLocalizedName();
  const [selected, setSelected] = useState<Set<string>>(new Set(props.initial));
  const [query, setQuery] = useState("");
  const { submit, pending, error, stepArg } = useStepSubmit(props);

  // Services in the provider's own category (or its subcategories) come first.
  const [mine, others] = useMemo(() => {
    const own = props.groups.filter((g) => g.id === props.primaryCategoryId || g.parentId === props.primaryCategoryId);
    return [own, props.groups.filter((g) => !own.includes(g))];
  }, [props.groups, props.primaryCategoryId]);

  const q = query.trim().toLowerCase();
  const matches = (s: Named) => !q || s.nameEn.toLowerCase().includes(q) || s.nameSw.toLowerCase().includes(q);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderGroup = (g: ServiceGroup) => {
    const visible = g.services.filter(matches);
    if (!visible.length) return null;
    return (
      <fieldset key={g.id} className="mb-4">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{name(g)}</legend>
        <div className="flex flex-wrap gap-2">
          {visible.map((s) => {
            const on = selected.has(s.id);
            return (
              <label
                key={s.id}
                className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm ${
                  on ? "border-brand-500 bg-brand-50 font-semibold text-brand-900" : "border-line bg-surface"
                }`}
              >
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(s.id)} />
                {on && <Check aria-hidden className="size-4" />}
                {name(s)}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  };

  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), submit(() => saveServicesAction({ serviceIds: [...selected] }, stepArg)))} className="flex flex-col gap-4">
      <FormError error={error} />
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-subtle" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.profile.fields.searchServices} aria-label={t.profile.fields.searchServices} className="pl-10" />
      </div>
      <p className="text-sm font-medium text-brand-700">{fill(t.profile.fields.selectedCount, { count: selected.size })}</p>
      <div>{mine.map(renderGroup)}</div>
      {others.length > 0 && (
        <details open={!!q || others.some((g) => g.services.some((s) => props.initial.includes(s.id)))}>
          <summary className="mb-3 cursor-pointer text-sm font-semibold text-ink-muted">{t.profile.fields.moreServices}</summary>
          {others.map(renderGroup)}
        </details>
      )}
      <StepActions {...props} pending={pending} disabled={selected.size === 0} />
    </form>
  );
}
