"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/lib/validators/auth";
import { checkResetTokenAction, requestPasswordResetAction, resetPasswordAction } from "@/lib/actions/auth";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Alert, Button, ButtonLink, Field, Input } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<ErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await requestPasswordResetAction(data);
    if (result.ok) setSent(true);
    else setFormError(result.error);
  });

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t.auth.forgotSent}</Alert>
        <ButtonLink href="/login" variant="secondary">
          {t.auth.backToLogin}
        </ButtonLink>
      </div>
    );
  }

  const idError = errors.identifier?.message;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert>{t.errors[formError]}</Alert>}
      <Field id="identifier" label={t.auth.identifier} error={idError ? t.errors[idError as ErrorKey] : undefined}>
        <Input id="identifier" autoComplete="username" placeholder={t.auth.identifierPlaceholder} invalid={!!idError} {...register("identifier")} />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t.auth.sending : t.auth.sendLink}
      </Button>
      <Link href="/login" className="text-center text-sm font-medium text-brand-700 hover:underline">
        {t.auth.backToLogin}
      </Link>
    </form>
  );
}

/**
 * Reads the token from the link's fragment (#token=…; older links used ?token=), removes it from
 * the address bar and history straight away, then checks it with the server (SEC-008).
 */
export function ResetFromLink() {
  const { t } = useI18n();
  const [state, setState] = useState<{ status: "checking" } | { status: "valid"; token: string } | { status: "invalid"; rateLimited?: boolean }>({ status: "checking" });

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? new URLSearchParams(window.location.search).get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    let cancelled = false;
    checkResetTokenAction(token)
      .then((r) => !cancelled && setState(r.valid ? { status: "valid", token } : { status: "invalid", rateLimited: r.rateLimited }))
      .catch(() => !cancelled && setState({ status: "invalid" }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "checking") return <p className="text-sm text-ink-muted" aria-live="polite">{t.auth.resetChecking}</p>;
  if (state.status === "valid") return <ResetPasswordForm token={state.token} />;
  return (
    <div className="flex flex-col gap-4">
      <Alert>{state.rateLimited ? t.errors.rateLimited : t.auth.resetLinkInvalid}</Alert>
      <ButtonLink href="/forgot-password">{t.auth.requestNewLink}</ButtonLink>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<ErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token } });

  const err = (key?: string) => (key ? t.errors[key as ErrorKey] ?? t.errors.generic : undefined);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await resetPasswordAction(data);
    if (result.ok) setDone(true);
    else setFormError(result.error);
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t.auth.resetDone}</Alert>
        <ButtonLink href="/login">{t.auth.loginTitle}</ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <Alert>
          {formError === "tokenInvalid" ? t.auth.resetLinkInvalid : t.errors[formError]}{" "}
          {formError === "tokenInvalid" && (
            <Link href="/forgot-password" className="font-semibold underline">
              {t.auth.requestNewLink}
            </Link>
          )}
        </Alert>
      )}
      <input type="hidden" {...register("token")} />
      <Field id="password" label={t.auth.newPassword} hint={t.auth.passwordHint} error={err(errors.password?.message)}>
        <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register("password")} />
      </Field>
      <Field id="confirmPassword" label={t.auth.confirmPassword} error={err(errors.confirmPassword?.message)}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? t.auth.resetting : t.auth.resetButton}
      </Button>
    </form>
  );
}
