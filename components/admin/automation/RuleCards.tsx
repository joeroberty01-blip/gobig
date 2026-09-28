"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Alert, Button, Field, Input } from "@/components/ui";
import { saveAutomationRuleAction } from "@/lib/actions/automation";

export type RuleCardData = {
  id: string;
  trigger: { kind: "event" } | { kind: "schedule"; every: string };
  enabled: boolean;
  params: Record<string, number>;
  fields: { key: string; min: number; max: number }[];
};

/** Automation Engine (Phase B): one card per rule — switch, settings, save. */
export function RuleCards({ rules, canEdit }: { rules: RuleCardData[]; canEdit: boolean }) {
  return (
    <div className="grid gap-3">
      {rules.map((r) => (
        <RuleCard key={r.id} rule={r} canEdit={canEdit} />
      ))}
    </div>
  );
}

function RuleCard({ rule, canEdit }: { rule: RuleCardData; canEdit: boolean }) {
  const { t } = useI18n();
  const s = t.adminPlatform.settings;
  const text = s.rules[rule.id as keyof typeof s.rules] as Record<string, string> | undefined;
  const [enabled, setEnabled] = useState(rule.enabled);
  const [params, setParams] = useState(rule.params);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const when = rule.trigger.kind === "schedule" ? s.schedule[rule.trigger.every as keyof typeof s.schedule] : s.onEvent;

  const save = () =>
    start(async () => {
      const r = await saveAutomationRuleAction(rule.id, { enabled, params });
      setMsg(r.ok ? { ok: true, text: s.saved } : { ok: false, text: r.error === "forbidden" ? s.superOnly : t.errors.generic });
    });

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{text?.title ?? rule.id}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {when}
            {text?.hint ? ` · ${text.hint}` : ""}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-semibold ${enabled ? "text-success" : "text-ink-muted"}`}>{enabled ? s.on : s.off}</span>
          <input type="checkbox" role="switch" aria-label={text?.title ?? rule.id} checked={enabled} disabled={!canEdit || pending} onChange={(e) => setEnabled(e.target.checked)} className="peer sr-only" />
          <span aria-hidden className="relative h-6 w-11 rounded-full bg-line transition peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-brand-500 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>
      </div>
      {rule.fields.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {rule.fields.map((f) => (
            <Field key={f.key} id={`rule-${rule.id}-${f.key}`} label={text?.[f.key] ?? f.key} hint={`${f.min}–${f.max}`}>
              <Input
                id={`rule-${rule.id}-${f.key}`}
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                disabled={!canEdit || pending}
                value={params[f.key] ?? ""}
                onChange={(e) => setParams({ ...params, [f.key]: Math.floor(Number(e.target.value) || 0) })}
              />
            </Field>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" className="min-h-9" onClick={save} disabled={pending}>
            {t.adminPlatform.common.save}
          </Button>
          {msg && (
            <span role="status" className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>
              {msg.text}
            </span>
          )}
        </div>
      )}
      {msg && !msg.ok && !canEdit && <Alert>{msg.text}</Alert>}
    </div>
  );
}
