"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { skipStepAction, type ProviderActionResult } from "@/lib/actions/provider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { nextStep, OPTIONAL_STEPS, type SetupStep } from "@/lib/provider/steps";
import { Alert, Button } from "@/components/ui";

type ErrorKey = keyof Dictionary["errors"];

export type StepProps = { step: SetupStep; editMode: boolean };

/**
 * Save-and-continue behaviour shared by every step: runs the action, shows its error, then goes
 * to the next step (onboarding) or back to the dashboard (editing one section).
 */
export function useStepSubmit({ step, editMode }: StepProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ key: ErrorKey; field?: string } | null>(null);

  const destination = () => {
    const next = nextStep(step);
    return editMode || !next ? "/provider" : `/provider/setup/${next}`;
  };

  const submit = (run: () => Promise<ProviderActionResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setError({ key: result.error, field: result.field });
        return;
      }
      router.push(destination());
      router.refresh();
    });
  };

  const skip = () =>
    startTransition(async () => {
      await skipStepAction(step);
      router.push(destination());
    });

  return { submit, skip, pending, error, stepArg: editMode ? undefined : step };
}

export function FormError({ error }: { error: { key: ErrorKey } | null }) {
  const { t } = useI18n();
  if (!error) return null;
  return <Alert>{t.errors[error.key] ?? t.errors.generic}</Alert>;
}

/** Sticky bottom bar with the primary button (and Skip on optional onboarding steps). */
export function StepActions({
  step,
  editMode,
  pending,
  disabled = false,
  onSkip,
  label,
}: StepProps & { pending: boolean; /** Not ready to submit yet (nothing chosen) — not the same as saving. */ disabled?: boolean; onSkip?: () => void; label?: string }) {
  const { t } = useI18n();
  const canSkip = !editMode && OPTIONAL_STEPS.includes(step) && onSkip;
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-6 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {canSkip && (
          <Button type="button" variant="ghost" onClick={onSkip} disabled={pending}>
            {t.profile.setup.skip}
          </Button>
        )}
        <Button type="submit" disabled={pending || disabled} className="sm:min-w-40">
          {pending ? t.profile.setup.saving : (label ?? (editMode ? t.profile.setup.save : t.profile.setup.continue))}
        </Button>
      </div>
    </div>
  );
}

export function useLocalizedName() {
  const { locale } = useI18n();
  return (x: { nameEn: string; nameSw: string }) => (locale === "sw" ? x.nameSw : x.nameEn);
}
