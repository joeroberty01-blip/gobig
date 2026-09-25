"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewRankingAction, resetRankingAction, saveRankingAction, type PreviewRow } from "@/lib/actions/ranking";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { DEFAULT_WEIGHTS, MAX_WEIGHT, MIN_WEIGHTS, SIGNALS, type Signal, type Weights } from "@/lib/ranking/engine";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

const GROUPS: { key: "request" | "trust" | "responsiveness"; signals: Signal[] }[] = [
  { key: "request", signals: ["serviceRelevance", "locationRelevance", "serviceArea", "distance", "availability"] },
  { key: "trust", signals: ["verification", "rating", "reviewQuality"] },
  { key: "responsiveness", signals: ["responseRate", "responseTime", "profileCompleteness", "recentActivity"] },
];

const control = "block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base focus:outline-2 focus:outline-brand-500";

export function RankingForm({
  saved,
  services,
  areas,
}: {
  saved: Weights;
  services: { slug: string; nameEn: string; nameSw: string }[];
  areas: { slug: string; name: string; children: { slug: string; name: string }[] }[];
}) {
  const { t, locale } = useI18n();
  const r = t.ranking;
  const router = useRouter();
  const [weights, setWeights] = useState<Weights>(saved);
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState(false);

  const [q, setQ] = useState("");
  const [service, setService] = useState("");
  const [area, setArea] = useState("");
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; total: number } | null>(null);
  const [previewing, startPreview] = useTransition();

  const dirty = SIGNALS.some((s) => weights[s] !== saved[s]);
  const total = SIGNALS.reduce((sum, s) => sum + weights[s], 0);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: ErrorKey }>) =>
    start(async () => {
      setError(null);
      setDone(false);
      const res = await fn();
      if (!res.ok) return setError(res.error);
      setDone(true);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <form
        noValidate
        onSubmit={(e) => (e.preventDefault(), run(() => saveRankingAction(weights)))}
        className="flex flex-col gap-5"
      >
        {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
        {done && !dirty && <Alert tone="success">{r.saved}</Alert>}
        {GROUPS.map((g) => (
          <fieldset key={g.key} className="rounded-2xl border border-line bg-surface p-4">
            <legend className="px-1 text-sm font-semibold">{r.groups[g.key]}</legend>
            <div className="flex flex-col gap-4">
              {g.signals.map((s) => {
                const min = MIN_WEIGHTS[s] ?? 0;
                const share = total > 0 ? Math.round((weights[s] / total) * 100) : 0;
                return (
                  <div key={s} className="grid gap-1 sm:grid-cols-[1fr_220px] sm:items-center sm:gap-4">
                    <div>
                      <label htmlFor={`w-${s}`} className="text-sm font-medium">
                        {r.signals[s].label}
                      </label>
                      <p className="text-xs text-ink-subtle">{r.signals[s].hint}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        id={`w-${s}`}
                        type="range"
                        min={min}
                        max={MAX_WEIGHT}
                        step={1}
                        value={weights[s]}
                        onChange={(e) => setWeights({ ...weights, [s]: Number(e.target.value) })}
                        className="w-full accent-brand-700"
                      />
                      <span className="w-16 shrink-0 text-right text-sm tabular-nums">
                        {weights[s] === 0 ? r.off : `${weights[s]} · ${share}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? r.saving : r.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || SIGNALS.every((s) => saved[s] === DEFAULT_WEIGHTS[s])}
            onClick={() => confirm(r.resetConfirm) && run(async () => {
              const res = await resetRankingAction();
              if (res.ok) setWeights({ ...DEFAULT_WEIGHTS });
              return res;
            })}
          >
            {r.reset}
          </Button>
          {dirty && <span className="text-sm font-medium text-accent-500">{r.unsaved}</span>}
        </div>
      </form>

      <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="preview-title">
        <h2 id="preview-title" className="font-semibold">
          {r.preview.title}
        </h2>
        <p className="mb-3 text-sm text-ink-muted">{r.preview.intro}</p>
        <form
          noValidate
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            startPreview(async () => {
              setError(null);
              const res = await previewRankingAction({ q, service, area, weights });
              if (!res.ok) return setError(res.error);
              setPreview({ rows: res.rows, total: res.total });
            });
          }}
        >
          <Field id="pq" label={r.preview.q}>
            <Input id="pq" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
          </Field>
          <Field id="ps" label={r.preview.service}>
            <select id="ps" value={service} onChange={(e) => setService(e.target.value)} className={control}>
              <option value="">{r.preview.anyService}</option>
              {services.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {locale === "sw" ? s.nameSw : s.nameEn}
                </option>
              ))}
            </select>
          </Field>
          <Field id="pa" label={r.preview.area}>
            <select id="pa" value={area} onChange={(e) => setArea(e.target.value)} className={control}>
              <option value="">{r.preview.anyArea}</option>
              {areas.map((d) => (
                <optgroup key={d.slug} label={d.name}>
                  <option value={d.slug}>{d.name}</option>
                  {d.children.map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="secondary" disabled={previewing}>
              {previewing ? r.preview.running : r.preview.run}
            </Button>
          </div>
        </form>

        {preview && (
          <div className="mt-4">
            {preview.rows.length === 0 ? (
              <p className="text-sm text-ink-muted">{r.preview.empty}</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-ink-subtle">{fill(r.preview.total, { count: preview.total })}</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-ink-subtle">
                        <th className="py-2 pr-2">#</th>
                        <th className="py-2 pr-2">{t.admin.colName}</th>
                        <th className="py-2 pr-2 text-right">{r.preview.score}</th>
                        {SIGNALS.map((s) => (
                          <th key={s} className="px-1 py-2 text-right font-normal" title={r.signals[s].label}>
                            {r.signals[s].short}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={row.id} className="border-b border-line last:border-0">
                          <td className="py-2 pr-2 tabular-nums">{i + 1}</td>
                          <td className="py-2 pr-2">
                            <a href={`/p/${row.slug}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                              {row.name}
                            </a>
                          </td>
                          <td className="py-2 pr-2 text-right font-semibold tabular-nums">{Math.round(row.score * 100)}</td>
                          {SIGNALS.map((s) => (
                            <td key={s} className={`px-1 py-2 text-right tabular-nums ${weights[s] === 0 ? "text-ink-subtle line-through" : ""}`}>
                              {Math.round(row.breakdown[s] * 100)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
