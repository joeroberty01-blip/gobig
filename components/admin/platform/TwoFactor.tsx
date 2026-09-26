"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { beginTwoFactorAction, confirmTwoFactorAction, regenerateRecoveryCodesAction } from "@/lib/actions/security";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

function RecoveryCodes({ codes }: { codes: string[] }) {
  const { t } = useI18n();
  const s = t.security;
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info">{s.codesIntro}</Alert>
      <ol className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-4 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>
        {s.copy}
      </Button>
    </div>
  );
}

/** Set-up: scan the QR code (or type the key), confirm with a code, then save recovery codes. */
export function TwoFactorSetup() {
  const { t } = useI18n();
  const s = t.security;
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{s.enabled}</Alert>
        <RecoveryCodes codes={codes} />
        <p className="text-sm text-ink-muted">{s.signInAgain}</p>
        <Button type="button" onClick={() => signOut({ redirectTo: "/login?callbackUrl=%2Fadmin" })}>
          {s.continue}
        </Button>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="flex flex-col gap-3">
        {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
        <p className="text-sm text-ink-muted">{s.why}</p>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await beginTwoFactorAction();
              if (!r.ok) return setError(r.error);
              setSetup({ secret: r.secret, qr: r.qr });
            })
          }
        >
          {s.start}
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await confirmTwoFactorAction(code);
          if (!r.ok) return setError(r.error);
          setCodes(r.recoveryCodes);
        });
      }}
    >
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
        <li>{s.step1}</li>
        <li>{s.step2}</li>
        <li>{s.step3}</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt={s.qrAlt} width={220} height={220} className="rounded-xl border border-line bg-white p-2" />
      <p className="text-sm">
        {s.manual} <code className="rounded bg-canvas px-2 py-1 font-mono text-xs break-all">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
      </p>
      <Field id="totp-code" label={t.auth.otpLabel}>
        <Input id="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending || code.trim().length !== 6}>
        {s.confirm}
      </Button>
    </form>
  );
}

export function RegenerateRecoveryCodes() {
  const { t } = useI18n();
  const s = t.security;
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  if (codes) return <RecoveryCodes codes={codes} />;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await regenerateRecoveryCodesAction(code);
          if (!r.ok) return setError(r.error);
          setCodes(r.recoveryCodes);
        });
      }}
    >
      {error && <Alert>{t.errors[error] ?? t.errors.generic}</Alert>}
      <Field id="regen-code" label={t.auth.otpLabel} hint={s.regenerateHint}>
        <Input id="regen-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending || code.trim().length !== 6}>
        {s.regenerate}
      </Button>
    </form>
  );
}
