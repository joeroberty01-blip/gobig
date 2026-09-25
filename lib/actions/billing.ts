"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getOwnedProviderId } from "@/lib/services/providerProfile";
import * as billing from "@/lib/services/billing";
import * as v from "@/lib/validators/billing";

// Phase 11 server actions: authenticate → can() → validate → service (audited). Provider ids come
// from the session; admins act on ids that the service re-checks.

type ErrorKey = keyof Dictionary["errors"];
export type BillingActionResult = { ok: true } | { ok: false; error: ErrorKey; field?: string };

function invalid(error: z.ZodError): BillingActionResult {
  const issue = error.issues[0];
  return { ok: false, error: (issue?.message as ErrorKey) ?? "generic", field: issue?.path.map(String).join(".") };
}
const fail = (error: string): BillingActionResult => ({ ok: false, error: error as ErrorKey });

function refresh() {
  revalidatePath("/provider/plan");
  revalidatePath("/admin/monetization");
  revalidatePath("/search");
}

async function ownProvider() {
  const user = await getCurrentUser();
  if (!can(user, "billing:manage-own")) return null;
  const providerId = await getOwnedProviderId(user!.id);
  return providerId ? { user: user!, providerId } : null;
}

// ─── Provider ───────────────────────────────────────────────────────────────────────────────

export async function requestPlanAction(planId: string): Promise<BillingActionResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  if (typeof planId !== "string" || planId.length > 40) return fail("planUnavailable");
  const r = await billing.requestPlan(owner.providerId, owner.user.id, planId);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function cancelPlanRequestAction(): Promise<BillingActionResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  const r = await billing.cancelPendingPlan(owner.providerId, owner.user.id);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function requestCampaignAction(input: z.input<typeof v.campaignRequestSchema>): Promise<BillingActionResult> {
  const owner = await ownProvider();
  if (!owner) return fail("forbidden");
  const parsed = v.campaignRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await billing.requestCampaign(owner.providerId, owner.user.id, parsed.data);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

// ─── Admin ──────────────────────────────────────────────────────────────────────────────────

export async function savePlanAction(input: z.input<typeof v.planSchema>): Promise<BillingActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "billing:configure")) return fail("forbidden");
  const parsed = v.planSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { planId, ...edit } = parsed.data;
  const r = await billing.updatePlan(user!.id, planId, edit);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function saveMonetizationSettingsAction(input: z.input<typeof v.settingsSchema>): Promise<BillingActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "billing:configure")) return fail("forbidden");
  const parsed = v.settingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await billing.saveSettings(user!.id, parsed.data);
  refresh();
  return { ok: true };
}

export async function recordPaymentAction(kind: "subscription" | "campaign", input: z.input<typeof v.paymentSchema>): Promise<BillingActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "billing:manage")) return fail("forbidden");
  const parsed = v.paymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { targetId, ...payment } = parsed.data;
  const r =
    kind === "subscription"
      ? await billing.recordSubscriptionPayment(user!.id, targetId, payment)
      : kind === "campaign"
        ? await billing.recordCampaignPayment(user!.id, targetId, payment)
        : ({ ok: false, error: "notAllowed" } as const);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function cancelSubscriptionAction(input: z.input<typeof v.reasonSchema>): Promise<BillingActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "billing:manage")) return fail("forbidden");
  const parsed = v.reasonSchema.safeParse(input);
  if (!parsed.success) return fail("noteRequired");
  const r = await billing.adminCancelSubscription(user!.id, parsed.data.id, parsed.data.reason);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function voidPaymentAction(input: z.input<typeof v.reasonSchema>): Promise<BillingActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "billing:manage")) return fail("forbidden");
  const parsed = v.reasonSchema.safeParse(input);
  if (!parsed.success) return fail("noteRequired");
  const r = await billing.voidPayment(user!.id, parsed.data.id, parsed.data.reason);
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}

export async function campaignAction(input: z.input<typeof v.campaignActionSchema>): Promise<BillingActionResult> {
  const user = await getCurrentUser();
  if (!can(user, "billing:manage")) return fail("forbidden");
  const parsed = v.campaignActionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const r = await billing.updateCampaign(user!.id, parsed.data.campaignId, parsed.data.action, { priceTzs: parsed.data.priceTzs ?? undefined, note: parsed.data.note });
  if (!r.ok) return fail(r.error);
  refresh();
  return { ok: true };
}
