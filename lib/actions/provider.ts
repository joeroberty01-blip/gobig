"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { SETUP_STEPS, type SetupStep } from "@/lib/provider/steps";
import { deleteProviderImage } from "@/lib/services/media";
import * as svc from "@/lib/services/providerProfile";
import * as v from "@/lib/validators/provider";

// Each action: signed-in PROVIDER → owns a business → input validated → service call. The
// providerId always comes from the session, never from the client.

type ErrorKey = keyof Dictionary["errors"];
export type ProviderActionResult = { ok: true } | { ok: false; error: ErrorKey; field?: string };

async function ownedProvider(): Promise<{ ok: true; userId: string; providerId: string | null } | { ok: false; error: ErrorKey }> {
  const user = await getCurrentUser();
  if (!can(user, "provider:edit-own")) return { ok: false, error: "forbidden" };
  return { ok: true, userId: user!.id, providerId: await svc.getOwnedProviderId(user!.id) };
}

function invalid(error: z.ZodError): ProviderActionResult {
  const issue = error.issues[0];
  return { ok: false, error: (issue?.message as ErrorKey) ?? "generic", field: issue?.path.map(String).join(".") };
}

async function done(providerId: string, step?: SetupStep): Promise<ProviderActionResult> {
  if (step) await svc.recordOnboardingStep(providerId, SETUP_STEPS.indexOf(step));
  revalidatePath("/provider", "layout");
  revalidatePath("/p/[slug]", "page");
  return { ok: true };
}

/** Validates with `schema`, then runs `write` for the caller's business. */
function sectionAction<S extends z.ZodType>(
  schema: S,
  write: (providerId: string, data: z.output<S>) => Promise<svc.Result>,
) {
  return async (input: z.input<S>, step?: SetupStep): Promise<ProviderActionResult> => {
    const owner = await ownedProvider();
    if (!owner.ok) return owner;
    if (!owner.providerId) return { ok: false, error: "noBusinessYet" };
    const parsed = schema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const result = await write(owner.providerId, parsed.data);
    if (!result.ok) return result;
    return done(owner.providerId, step);
  };
}

export async function saveNameAction(input: z.input<typeof v.nameSchema>, step?: SetupStep): Promise<ProviderActionResult> {
  const owner = await ownedProvider();
  if (!owner.ok) return owner;
  const parsed = v.nameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { providerId } = await svc.saveBusinessName(owner.userId, parsed.data.displayName);
  return done(providerId, step);
}

const categoryAction = sectionAction(v.categorySchema, (id, d) => svc.saveCategory(id, d.categoryId));
const servicesAction = sectionAction(v.servicesSchema, (id, d) => svc.saveServices(id, d.serviceIds));
const descriptionAction = sectionAction(v.descriptionSchema, (id, d) => svc.saveDescription(id, d.description));
const contactAction = sectionAction(v.contactSchema, (id, d) => svc.saveContact(id, d.phone, d.email));
const whatsappAction = sectionAction(v.whatsappSchema, (id, d) => svc.saveWhatsapp(id, d.whatsapp));
const onlineAction = sectionAction(v.onlineSchema, (id, d) => svc.saveOnline(id, d.website, d.social));
const locationAction = sectionAction(v.locationSchema, (id, d) => svc.saveLocation(id, d));
const areasAction = sectionAction(v.areasSchema, (id, d) => svc.saveServiceAreas(id, d.locationIds));
const hoursAction = sectionAction(v.hoursSchema, (id, d) =>
  svc.saveHours(id, { mode: d.mode, note: d.note, days: d.days.filter((x) => x !== null) }),
);
const pricingAction = sectionAction(v.pricingSchema, (id, d) => svc.savePricing(id, d.items));
const actionsAction = sectionAction(v.actionsSchema, (id, d) => svc.saveActions(id, d.actions, { bookingUrl: d.bookingUrl, rideUrl: d.rideUrl }));

// "use server" modules may only export async functions, so each is wrapped explicitly.
export async function saveCategoryAction(i: z.input<typeof v.categorySchema>, s?: SetupStep) { return categoryAction(i, s); }
export async function saveServicesAction(i: z.input<typeof v.servicesSchema>, s?: SetupStep) { return servicesAction(i, s); }
export async function saveDescriptionAction(i: z.input<typeof v.descriptionSchema>, s?: SetupStep) { return descriptionAction(i, s); }
export async function saveContactAction(i: z.input<typeof v.contactSchema>, s?: SetupStep) { return contactAction(i, s); }
export async function saveWhatsappAction(i: z.input<typeof v.whatsappSchema>, s?: SetupStep) { return whatsappAction(i, s); }
export async function saveOnlineAction(i: z.input<typeof v.onlineSchema>, s?: SetupStep) { return onlineAction(i, s); }
export async function saveLocationAction(i: z.input<typeof v.locationSchema>, s?: SetupStep) { return locationAction(i, s); }
export async function saveAreasAction(i: z.input<typeof v.areasSchema>, s?: SetupStep) { return areasAction(i, s); }
export async function saveHoursAction(i: z.input<typeof v.hoursSchema>, s?: SetupStep) { return hoursAction(i, s); }
export async function savePricingAction(i: z.input<typeof v.pricingSchema>, s?: SetupStep) { return pricingAction(i, s); }
export async function saveActionsAction(i: z.input<typeof v.actionsSchema>, s?: SetupStep) { return actionsAction(i, s); }

/** Marks an optional step as seen without saving anything. */
export async function skipStepAction(step: SetupStep): Promise<ProviderActionResult> {
  const owner = await ownedProvider();
  if (!owner.ok) return owner;
  if (!owner.providerId) return { ok: false, error: "noBusinessYet" };
  return done(owner.providerId, step);
}

export async function deleteMediaAction(assetId: string): Promise<ProviderActionResult> {
  const owner = await ownedProvider();
  if (!owner.ok) return owner;
  if (!owner.providerId || typeof assetId !== "string") return { ok: false, error: "notAllowed" };
  // Removing an image never makes a profile unpublishable (photos are optional).
  const removed = await deleteProviderImage(owner.providerId, assetId);
  return removed ? done(owner.providerId) : { ok: false, error: "notAllowed" };
}

export async function publishAction(): Promise<ProviderActionResult> {
  const owner = await ownedProvider();
  if (!owner.ok) return owner;
  if (!owner.providerId) return { ok: false, error: "noBusinessYet" };
  const result = await svc.publishProvider(owner.providerId);
  return result.ok ? done(owner.providerId, "review") : result;
}

export async function unpublishAction(): Promise<ProviderActionResult> {
  const owner = await ownedProvider();
  if (!owner.ok) return owner;
  if (!owner.providerId) return { ok: false, error: "noBusinessYet" };
  const result = await svc.unpublishProvider(owner.providerId);
  return result.ok ? done(owner.providerId) : result;
}
