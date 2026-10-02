"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { KeyRound, LogOut, MapPinOff, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Alert, Button, Field, Input } from "@/components/ui";
import { changePasswordAction, deleteAccountAction, signOutEverywhereAction, updateNameAction, type AccountResult } from "@/lib/actions/account";
import { clearPointAction, setAreaAction } from "@/lib/actions/discovery";

/** Maps an action error to text: settings' own messages first, then the shared form errors. */
function useErrorText() {
  const { t } = useI18n();
  return (r: AccountResult) => {
    if (r.ok) return "";
    const s = t.settings as Record<string, string>;
    const e = t.errors as Record<string, string>;
    return s[r.error] ?? e[r.error] ?? t.settings.generic;
  };
}

export function NameForm({ name }: { name: string }) {
  const { t } = useI18n();
  const s = t.settings;
  const router = useRouter();
  const errorText = useErrorText();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (!editing)
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium break-all">{name}</span>
        <Button type="button" variant="ghost" className="min-h-9 px-2.5" onClick={() => setEditing(true)}>
          <Pencil aria-hidden className="size-4" />
          {s.editName}
        </Button>
      </div>
    );
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateNameAction(value);
          if (!r.ok) return setError(r.error === "nameInvalid" ? s.nameInvalid : errorText(r));
          setError("");
          setEditing(false);
          router.refresh();
        });
      }}
    >
      <div className="flex-1">
        <Input aria-label={t.account.name} value={value} maxLength={80} autoComplete="name" invalid={!!error} onChange={(e) => setValue(e.target.value)} autoFocus />
        {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{s.save}</Button>
        <Button type="button" variant="secondary" onClick={() => (setEditing(false), setValue(name), setError(""))}>
          {s.cancel}
        </Button>
      </div>
    </form>
  );
}

export function ForgetLocation() {
  const { t } = useI18n();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          await clearPointAction();
          await setAreaAction(null);
          setDone(true);
          router.refresh();
        })
      }
    >
      <MapPinOff aria-hidden className="size-4" />
      {done ? t.settings.locationCleared : t.settings.locationClear}
    </Button>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  const s = t.settings;
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) return <Alert tone="success">{s.passwordChanged}</Alert>;
  if (!open)
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <KeyRound aria-hidden className="size-4" />
        {s.changePassword}
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const next = String(f.get("next") ?? "");
        if (next !== String(f.get("confirm") ?? "")) return setError(t.errors.passwordsDontMatch);
        start(async () => {
          const r = await changePasswordAction(String(f.get("current") ?? ""), next);
          if (!r.ok) return setError(errorText(r));
          setDone(true);
          // Every session ended with the old password; sign in again.
          setTimeout(() => signOut({ redirectTo: "/login" }), 2500);
        });
      }}
    >
      <Field id="pw-current" label={s.currentPassword}>
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required maxLength={128} />
      </Field>
      <Field id="pw-next" label={s.newPassword} hint={t.errors.passwordTooShort}>
        <Input id="pw-next" name="next" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      </Field>
      <Field id="pw-confirm" label={s.confirmPassword}>
        <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required maxLength={128} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{s.changePassword}</Button>
        <Button type="button" variant="secondary" onClick={() => (setOpen(false), setError(""))}>
          {s.cancel}
        </Button>
      </div>
    </form>
  );
}

export function SignOutEverywhere() {
  const { t } = useI18n();
  const s = t.settings;
  const [pending, start] = useTransition();
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(s.signOutAllConfirm)) return;
          start(async () => {
            const r = await signOutEverywhereAction();
            if (r.ok) await signOut({ redirectTo: "/login" });
          });
        }}
      >
        <LogOut aria-hidden className="size-4" />
        {s.signOutAll}
      </Button>
      <p className="mt-1.5 text-xs text-ink-subtle">{s.signOutAllHint}</p>
    </div>
  );
}

export function DeleteAccount() {
  const { t } = useI18n();
  const s = t.settings;
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (!open)
    return (
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden className="size-4" />
        {s.deleteButton}
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await deleteAccountAction(String(f.get("password") ?? ""), f.get("confirm") === "on");
          if (!r.ok) return setError(r.error === "notCustomer" ? s.deleteNotCustomer : r.error === "activeTrip" ? s.deleteActiveTrip : errorText(r));
          await signOut({ redirectTo: "/?deleted=1" });
        });
      }}
    >
      <Field id="del-password" label={s.deletePassword}>
        <Input id="del-password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="size-4 accent-[var(--color-danger)]" />
        {s.deleteConfirmLabel}
      </label>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>{s.deleteButton}</Button>
        <Button type="button" variant="secondary" onClick={() => (setOpen(false), setError(""))}>
          {s.cancel}
        </Button>
      </div>
    </form>
  );
}
