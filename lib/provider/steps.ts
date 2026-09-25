// The onboarding wizard (brief, Phase 2: account → CTA selection). Step 1 "Account" is sign-up
// itself; these are the rest, in order. The same screens are reused to edit a section later.

export const SETUP_STEPS = [
  "name",
  "category",
  "services",
  "description",
  "contact",
  "whatsapp",
  "online",
  "location",
  "areas",
  "hours",
  "pricing",
  "photos",
  "actions",
  "review",
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(v: string): v is SetupStep {
  return (SETUP_STEPS as readonly string[]).includes(v);
}

export function nextStep(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return SETUP_STEPS[i + 1] ?? null;
}

export function prevStep(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return i > 0 ? SETUP_STEPS[i - 1]! : null;
}

/** Steps a provider may skip during onboarding (everything not needed to publish). */
export const OPTIONAL_STEPS: readonly SetupStep[] = ["whatsapp", "online", "areas", "hours", "pricing", "photos"];
