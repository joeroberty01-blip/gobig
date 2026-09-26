"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminCancelRequestAction,
  resolveReportAction,
  saveCategoryAction,
  saveLocationAction,
  savePlatformSettingsAction,
  saveServiceAction,
  sendAnnouncementAction,
  setProviderListingAction,
  setUserStatusAction,
  type AdminActionResult,
} from "@/lib/actions/adminPlatform";
import { resetTwoFactorAction } from "@/lib/actions/security";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];
const control = "block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base focus:outline-2 focus:outline-brand-500";
const textarea = "block w-full rounded-xl border border-line bg-surface px-3 py-2 text-base focus:outline-2 focus:outline-brand-500";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = (fn: () => Promise<AdminActionResult>, after?: (r: Extract<AdminActionResult, { ok: true }>) => void) =>
    start(async () => {
      setError(null);
      setDone(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setDone(r.message ?? "ok");
      after?.(r);
      router.refresh();
    });
  return { pending, error, done, run };
}

function Err({ error }: { error: ErrorKey | null }) {
  const { t } = useI18n();
  return error ? <Alert>{t.errors[error] ?? t.errors.generic}</Alert> : null;
}

/** A consequential admin action that needs a written reason (kept in the audit log). */
type ReasonKind =
  | { kind: "suspendUser" | "reactivateUser"; id: string }
  | { kind: "suspendProvider" | "reinstateProvider"; id: string }
  | { kind: "cancelRequest"; id: string }
  | { kind: "resetTwoFactor"; id: string };

export function ReasonAction({ action, label, hint, danger = false }: { action: ReasonKind; label: string; hint?: string; danger?: boolean }) {
  const { t } = useI18n();
  const c = t.adminPlatform.common;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, error, run } = useRun();
  const submit = () =>
    run(
      () => {
        switch (action.kind) {
          case "suspendUser":
            return setUserStatusAction({ id: action.id, status: "SUSPENDED", reason });
          case "reactivateUser":
            return setUserStatusAction({ id: action.id, status: "ACTIVE", reason });
          case "suspendProvider":
            return setProviderListingAction({ id: action.id, action: "suspend", reason });
          case "reinstateProvider":
            return setProviderListingAction({ id: action.id, action: "reinstate", reason });
          case "cancelRequest":
            return adminCancelRequestAction({ id: action.id, reason });
          case "resetTwoFactor":
            return resetTwoFactorAction({ id: action.id, reason });
        }
      },
      () => (setOpen(false), setReason("")),
    );
  if (!open) {
    return (
      <Button type="button" variant={danger ? "danger" : "secondary"} className="min-h-9" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form noValidate className="flex w-full flex-col gap-2 rounded-xl bg-canvas p-3" onSubmit={(e) => (e.preventDefault(), submit())}>
      <Err error={error} />
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      <Field id={`reason-${action.kind}-${action.id}`} label={c.reason} hint={c.reasonHint}>
        <textarea id={`reason-${action.kind}-${action.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className={textarea} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending || reason.trim().length < 3}>
          {label}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

// ─── Catalogue ──────────────────────────────────────────────────────────────────────────────

export function CategoryForm({
  initial,
  parents,
  icons,
}: {
  initial: { id: string | null; nameEn: string; nameSw: string; icon: string | null; sortOrder: number; isActive: boolean; parentId: string | null };
  parents: { id: string; nameEn: string; nameSw: string }[];
  icons: string[];
}) {
  const { t, locale } = useI18n();
  const c = t.adminPlatform.catalog;
  const [f, setF] = useState({ ...initial, icon: initial.icon ?? "", parentId: initial.parentId ?? "" });
  const { pending, error, done, run } = useRun();
  const key = initial.id ?? "new";
  return (
    <form noValidate className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveCategoryAction(f)))}>
      <div className="sm:col-span-2">
        <Err error={error} />
        {done && <Alert tone="success">{t.adminPlatform.common.saved}</Alert>}
      </div>
      <Field id={`cat-en-${key}`} label={c.nameEn}>
        <Input id={`cat-en-${key}`} value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} maxLength={80} />
      </Field>
      <Field id={`cat-sw-${key}`} label={c.nameSw}>
        <Input id={`cat-sw-${key}`} value={f.nameSw} onChange={(e) => setF({ ...f, nameSw: e.target.value })} maxLength={80} />
      </Field>
      <Field id={`cat-parent-${key}`} label={c.parent}>
        <select id={`cat-parent-${key}`} value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })} className={control}>
          <option value="">{c.topLevel}</option>
          {parents
            .filter((p) => p.id !== initial.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {locale === "sw" ? p.nameSw : p.nameEn}
              </option>
            ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field id={`cat-icon-${key}`} label={c.icon}>
          <select id={`cat-icon-${key}`} value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} className={control}>
            <option value="">—</option>
            {icons.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`cat-order-${key}`} label={c.order}>
          <Input id={`cat-order-${key}`} type="number" min={0} max={999} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="size-4 accent-brand-700" />
        {t.adminPlatform.common.active}
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="min-h-9">
          {t.adminPlatform.common.save}
        </Button>
      </div>
    </form>
  );
}

export function ServiceForm({
  initial,
  categories,
}: {
  initial: { id: string | null; categoryId: string; nameEn: string; nameSw: string; keywords: string[]; sortOrder: number; isActive: boolean };
  categories: { id: string; label: string }[];
}) {
  const { t } = useI18n();
  const c = t.adminPlatform.catalog;
  const [f, setF] = useState({ ...initial, keywords: initial.keywords.join(", ") });
  const { pending, error, done, run } = useRun();
  const key = initial.id ?? `new-${initial.categoryId}`;
  return (
    <form noValidate className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveServiceAction(f)))}>
      <div className="sm:col-span-2">
        <Err error={error} />
        {done && <Alert tone="success">{t.adminPlatform.common.saved}</Alert>}
      </div>
      <Field id={`svc-en-${key}`} label={c.nameEn}>
        <Input id={`svc-en-${key}`} value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} maxLength={80} />
      </Field>
      <Field id={`svc-sw-${key}`} label={c.nameSw}>
        <Input id={`svc-sw-${key}`} value={f.nameSw} onChange={(e) => setF({ ...f, nameSw: e.target.value })} maxLength={80} />
      </Field>
      <div className="sm:col-span-2">
        <Field id={`svc-kw-${key}`} label={c.keywords}>
          <Input id={`svc-kw-${key}`} value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} maxLength={1000} />
        </Field>
      </div>
      <Field id={`svc-cat-${key}`} label={c.parent}>
        <select id={`svc-cat-${key}`} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} className={control}>
          {categories.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`svc-order-${key}`} label={c.order}>
        <Input id={`svc-order-${key}`} type="number" min={0} max={999} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="size-4 accent-brand-700" />
        {t.adminPlatform.common.active}
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="min-h-9">
          {t.adminPlatform.common.save}
        </Button>
      </div>
    </form>
  );
}

export function LocationForm({
  initial,
  districts,
}: {
  initial: { id: string | null; parentId: string; name: string; latitude: number | null; longitude: number | null; isActive: boolean };
  districts: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const l = t.adminPlatform.locations;
  const [f, setF] = useState({ ...initial, latitude: initial.latitude == null ? "" : String(initial.latitude), longitude: initial.longitude == null ? "" : String(initial.longitude) });
  const { pending, error, done, run } = useRun();
  const key = initial.id ?? `new-${initial.parentId}`;
  return (
    <form
      noValidate
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => (e.preventDefault(), run(() => saveLocationAction({ ...f, latitude: f.latitude || null, longitude: f.longitude || null })))}
    >
      <div className="sm:col-span-2">
        <Err error={error} />
        {done && <Alert tone="success">{t.adminPlatform.common.saved}</Alert>}
      </div>
      <Field id={`loc-name-${key}`} label={l.name}>
        <Input id={`loc-name-${key}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} />
      </Field>
      <Field id={`loc-d-${key}`} label={l.district}>
        <select id={`loc-d-${key}`} value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })} className={control}>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`loc-lat-${key}`} label={l.lat} hint={l.coordsHint}>
        <Input id={`loc-lat-${key}`} inputMode="decimal" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} />
      </Field>
      <Field id={`loc-lng-${key}`} label={l.lng}>
        <Input id={`loc-lng-${key}`} inputMode="decimal" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="size-4 accent-brand-700" />
        {t.adminPlatform.common.active}
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="min-h-9">
          {t.adminPlatform.common.save}
        </Button>
      </div>
    </form>
  );
}

// ─── Reports, announcements, settings ───────────────────────────────────────────────────────

export function ReportDecision({ id }: { id: string }) {
  const { t } = useI18n();
  const r = t.adminPlatform.reports;
  const [resolution, setResolution] = useState("");
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <Err error={error} />
      <Field id={`res-${id}`} label={r.resolution} hint={t.adminPlatform.common.reasonHint}>
        <textarea id={`res-${id}`} value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2} maxLength={500} className={textarea} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending || resolution.trim().length < 3} onClick={() => run(() => resolveReportAction({ id, outcome: "RESOLVED", resolution }))}>
          {r.resolve}
        </Button>
        <Button type="button" variant="secondary" disabled={pending || resolution.trim().length < 3} onClick={() => run(() => resolveReportAction({ id, outcome: "DISMISSED", resolution }))}>
          {r.dismiss}
        </Button>
      </div>
    </div>
  );
}

export function AnnouncementForm() {
  const { t } = useI18n();
  const a = t.adminPlatform.announcements;
  const [f, setF] = useState({ titleEn: "", titleSw: "", bodyEn: "", bodySw: "", audience: "ALL" as "ALL" | "CUSTOMERS" | "PROVIDERS" });
  const { pending, error, done, run } = useRun();
  const audienceLabel = { ALL: a.audienceALL, CUSTOMERS: a.audienceCUSTOMERS, PROVIDERS: a.audiencePROVIDERS }[f.audience];
  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm(fill(a.confirm, { audience: audienceLabel }))) run(() => sendAnnouncementAction(f), () => setF({ ...f, titleEn: "", titleSw: "", bodyEn: "", bodySw: "" }));
      }}
    >
      <div className="sm:col-span-2">
        <Err error={error} />
        {done && done !== "ok" && <Alert tone="success">{fill(a.sent, { count: done })}</Alert>}
      </div>
      <Field id="an-ten" label={a.titleEn}>
        <Input id="an-ten" value={f.titleEn} onChange={(e) => setF({ ...f, titleEn: e.target.value })} maxLength={100} />
      </Field>
      <Field id="an-tsw" label={a.titleSw}>
        <Input id="an-tsw" value={f.titleSw} onChange={(e) => setF({ ...f, titleSw: e.target.value })} maxLength={100} />
      </Field>
      <Field id="an-ben" label={a.bodyEn}>
        <textarea id="an-ben" value={f.bodyEn} onChange={(e) => setF({ ...f, bodyEn: e.target.value })} rows={4} maxLength={1000} className={textarea} />
      </Field>
      <Field id="an-bsw" label={a.bodySw}>
        <textarea id="an-bsw" value={f.bodySw} onChange={(e) => setF({ ...f, bodySw: e.target.value })} rows={4} maxLength={1000} className={textarea} />
      </Field>
      <Field id="an-aud" label={a.audience}>
        <select id="an-aud" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as typeof f.audience })} className={control}>
          <option value="ALL">{a.audienceALL}</option>
          <option value="CUSTOMERS">{a.audienceCUSTOMERS}</option>
          <option value="PROVIDERS">{a.audiencePROVIDERS}</option>
        </select>
      </Field>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {a.send}
        </Button>
      </div>
    </form>
  );
}

export function PlatformSettingsForm({
  initial,
  canEdit,
}: {
  initial: {
    supportEmail: string | null;
    supportPhone: string | null;
    supportWhatsapp: string | null;
    maxOpenRequests: number;
    maxRequestMatches: number;
    requestTtlDays: number;
    aiSearchEnabled: boolean;
  };
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const s = t.adminPlatform.settings;
  const [f, setF] = useState({ ...initial, supportEmail: initial.supportEmail ?? "", supportPhone: initial.supportPhone ?? "", supportWhatsapp: initial.supportWhatsapp ?? "" });
  const { pending, error, done, run } = useRun();
  const num = (k: "maxOpenRequests" | "maxRequestMatches" | "requestTtlDays", label: string, max: number) => (
    <Field id={`ps-${k}`} label={label}>
      <Input id={`ps-${k}`} type="number" min={1} max={max} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), run(() => savePlatformSettingsAction(f)))}>
      <Err error={error} />
      {done && <Alert tone="success">{t.adminPlatform.common.saved}</Alert>}
      {!canEdit && <Alert tone="info">{s.superOnly}</Alert>}
      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-5">
        <div>
          <h2 className="mb-2 font-semibold">{s.support}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="ps-email" label={s.supportEmail}>
              <Input id="ps-email" type="email" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} maxLength={120} />
            </Field>
            <Field id="ps-phone" label={s.supportPhone}>
              <Input id="ps-phone" inputMode="tel" value={f.supportPhone} onChange={(e) => setF({ ...f, supportPhone: e.target.value })} maxLength={20} />
            </Field>
            <Field id="ps-wa" label={s.supportWhatsapp}>
              <Input id="ps-wa" inputMode="tel" value={f.supportWhatsapp} onChange={(e) => setF({ ...f, supportWhatsapp: e.target.value })} maxLength={20} />
            </Field>
          </div>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">{s.requests}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {num("maxOpenRequests", s.maxOpenRequests, 50)}
            {num("maxRequestMatches", s.maxRequestMatches, 50)}
            {num("requestTtlDays", s.requestTtlDays, 60)}
          </div>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">{s.ai}</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.aiSearchEnabled} onChange={(e) => setF({ ...f, aiSearchEnabled: e.target.checked })} className="size-4 accent-brand-700" />
            {s.aiSearchEnabled}
          </label>
        </div>
        {canEdit && (
          <div>
            <Button type="submit">{t.adminPlatform.common.save}</Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
