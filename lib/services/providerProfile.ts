import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { computeCompletion, type CompletionSnapshot } from "@/lib/provider/completion";
import { isActionAvailable, type ConnectAction } from "@/lib/provider/connect";
import { slugify, type SocialPlatform } from "@/lib/provider/format";

// Provider profile writes. Framework-free (tested directly); server actions in
// lib/actions/provider.ts authenticate, validate with lib/validators/provider.ts, then call these.
// Every write is scoped to a providerId the caller has already proven ownership of.

type Db = Prisma.TransactionClient | typeof prisma;

export type ProfileError =
  | "categoryRequired"
  | "servicesRequired"
  | "locationRequired"
  | "areaInvalid"
  | "actionUnavailable"
  | "requiredWhilePublished"
  | "cannotPublish"
  | "notAllowed";

export type Result = { ok: true } | { ok: false; error: ProfileError };

class GuardError extends Error {
  constructor(public code: ProfileError) {
    super(code);
  }
}

/** The provider this user owns, if any. Phase 1–2: one business per owner. */
export async function getOwnedProviderId(userId: string): Promise<string | null> {
  const m = await prisma.providerMember.findFirst({
    where: { userId, role: "OWNER", provider: { deletedAt: null } },
    select: { providerId: true },
  });
  return m?.providerId ?? null;
}

export async function completionSnapshot(db: Db, providerId: string): Promise<CompletionSnapshot> {
  const p = await db.provider.findUniqueOrThrow({
    where: { id: providerId },
    select: {
      profile: true,
      services: { select: { pricedAt: true } },
      _count: { select: { serviceAreas: true, openingHours: true, socialLinks: true } },
      media: { select: { kind: true } },
    },
  });
  const profile = p.profile;
  return {
    displayName: profile?.displayName ?? null,
    primaryCategoryId: profile?.primaryCategoryId ?? null,
    serviceCount: p.services.length,
    pricedServiceCount: p.services.filter((s) => s.pricedAt !== null).length,
    description: profile?.description ?? null,
    phone: profile?.phone ?? null,
    whatsapp: profile?.whatsapp ?? null,
    website: profile?.website ?? null,
    socialCount: p._count.socialLinks,
    primaryLocationId: profile?.primaryLocationId ?? null,
    serviceAreaCount: p._count.serviceAreas,
    openingHoursMode: profile?.openingHoursMode ?? "SCHEDULE",
    openingHoursCount: p._count.openingHours,
    hasLogo: p.media.some((m) => m.kind === "LOGO"),
    hasCover: p.media.some((m) => m.kind === "COVER"),
    galleryCount: p.media.filter((m) => m.kind === "GALLERY").length,
    enabledActionCount: profile?.enabledActions.length ?? 0,
  };
}

/**
 * Runs a write in a transaction and rolls it back if it would leave a live (ACTIVE) profile
 * missing something required. Draft profiles may be incomplete.
 */
async function guarded(providerId: string, write: (tx: Prisma.TransactionClient) => Promise<void>): Promise<Result> {
  try {
    await prisma.$transaction(async (tx) => {
      await write(tx);
      const { status } = await tx.provider.findUniqueOrThrow({ where: { id: providerId }, select: { status: true } });
      if (status === "ACTIVE" && !computeCompletion(await completionSnapshot(tx, providerId)).canPublish) {
        throw new GuardError("requiredWhilePublished");
      }
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof GuardError) return { ok: false, error: err.code };
    throw err;
  }
}

async function uniqueSlug(db: Db, name: string, excludeProviderId?: string): Promise<string> {
  const base = slugify(name);
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const taken = await db.provider.findFirst({ where: { slug: candidate, NOT: excludeProviderId ? { id: excludeProviderId } : undefined }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Step 2: creates the business on first save, renames it afterwards. */
export async function saveBusinessName(userId: string, displayName: string): Promise<{ ok: true; providerId: string }> {
  const existing = await getOwnedProviderId(userId);
  if (!existing) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const provider = await prisma.$transaction(async (tx) =>
          tx.provider.create({
            data: {
              slug: await uniqueSlug(tx, displayName),
              members: { create: { userId, role: "OWNER" } },
              profile: { create: { displayName } },
            },
            select: { id: true },
          }),
        );
        return { ok: true, providerId: provider.id };
      } catch (err) {
        // Slug race with another sign-up: pick again.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    throw new Error("Could not allocate a unique provider slug");
  }

  await prisma.$transaction(async (tx) => {
    const p = await tx.provider.findUniqueOrThrow({ where: { id: existing }, select: { publishedAt: true } });
    await tx.providerProfile.update({ where: { providerId: existing }, data: { displayName } });
    // The public URL is fixed from the first publish on, so shared links keep working.
    if (!p.publishedAt) {
      await tx.provider.update({ where: { id: existing }, data: { slug: await uniqueSlug(tx, displayName, existing) } });
    }
  });
  return { ok: true, providerId: existing };
}

export async function saveCategory(providerId: string, categoryId: string): Promise<Result> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } });
  if (!category) return { ok: false, error: "categoryRequired" };
  return guarded(providerId, async (tx) => {
    await tx.providerProfile.update({ where: { providerId }, data: { primaryCategoryId: categoryId } });
  });
}

/** Replaces the service list, keeping the pricing of services that stay. */
export async function saveServices(providerId: string, serviceIds: string[]): Promise<Result> {
  const unique = [...new Set(serviceIds)];
  const valid = await prisma.service.findMany({ where: { id: { in: unique }, isActive: true }, select: { id: true } });
  if (valid.length !== unique.length || unique.length === 0) return { ok: false, error: "servicesRequired" };

  return guarded(providerId, async (tx) => {
    await tx.providerService.deleteMany({ where: { providerId, serviceId: { notIn: unique } } });
    await tx.providerService.createMany({ data: unique.map((serviceId) => ({ providerId, serviceId })), skipDuplicates: true });
  });
}

export async function saveDescription(providerId: string, description: string | null): Promise<Result> {
  return guarded(providerId, async (tx) => {
    await tx.providerProfile.update({ where: { providerId }, data: { description } });
  });
}

export async function saveContact(providerId: string, phone: string, email: string | null): Promise<Result> {
  return guarded(providerId, async (tx) => {
    await tx.providerProfile.update({ where: { providerId }, data: { phone, email } });
    await dropUnavailableActions(tx, providerId);
  });
}

export async function saveWhatsapp(providerId: string, whatsapp: string | null): Promise<Result> {
  return guarded(providerId, async (tx) => {
    await tx.providerProfile.update({ where: { providerId }, data: { whatsapp } });
    await dropUnavailableActions(tx, providerId);
  });
}

export async function saveOnline(
  providerId: string,
  website: string | null,
  social: { platform: SocialPlatform; url: string }[],
): Promise<Result> {
  return guarded(providerId, async (tx) => {
    await tx.providerProfile.update({ where: { providerId }, data: { website } });
    await tx.providerSocialLink.deleteMany({ where: { providerId } });
    if (social.length) await tx.providerSocialLink.createMany({ data: social.map((s) => ({ providerId, ...s })) });
    await dropUnavailableActions(tx, providerId);
  });
}

export async function saveLocation(
  providerId: string,
  input: {
    locationId: string;
    addressText: string | null;
    visibility: "EXACT" | "APPROXIMATE" | "AREA_ONLY";
    latitude?: number | null;
    longitude?: number | null;
    radiusKm?: number | null;
  },
): Promise<Result> {
  const loc = await prisma.location.findFirst({
    where: { id: input.locationId, isActive: true, type: { in: ["DISTRICT", "WARD", "NEIGHBOURHOOD"] } },
    select: { id: true },
  });
  if (!loc) return { ok: false, error: "locationRequired" };
  return guarded(providerId, async (tx) => {
    await tx.providerProfile.update({
      where: { providerId },
      data: {
        primaryLocationId: loc.id,
        addressText: input.addressText,
        locationVisibility: input.visibility,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        serviceRadiusKm: input.radiusKm ?? null,
      },
    });
    await dropUnavailableActions(tx, providerId);
  });
}

export async function saveServiceAreas(providerId: string, locationIds: string[]): Promise<Result> {
  const unique = [...new Set(locationIds)];
  const valid = await prisma.location.count({
    where: { id: { in: unique }, isActive: true, type: { in: ["DISTRICT", "WARD", "NEIGHBOURHOOD"] } },
  });
  if (valid !== unique.length) return { ok: false, error: "areaInvalid" };
  return guarded(providerId, async (tx) => {
    await tx.providerServiceArea.deleteMany({ where: { providerId } });
    if (unique.length) await tx.providerServiceArea.createMany({ data: unique.map((locationId) => ({ providerId, locationId })) });
  });
}

export async function saveHours(
  providerId: string,
  input: {
    mode: "SCHEDULE" | "ALWAYS_OPEN" | "BY_APPOINTMENT";
    days: { dayOfWeek: number; opensAt: number; closesAt: number }[];
    note: string | null;
  },
): Promise<Result> {
  return guarded(providerId, async (tx) => {
    await tx.providerProfile.update({ where: { providerId }, data: { openingHoursMode: input.mode, hoursNote: input.note } });
    await tx.providerOpeningHours.deleteMany({ where: { providerId } });
    // The schedule is only kept when it is what customers will see.
    if (input.mode === "SCHEDULE" && input.days.length) {
      await tx.providerOpeningHours.createMany({ data: input.days.map((d) => ({ providerId, ...d })) });
    }
  });
}

export async function savePricing(
  providerId: string,
  items: {
    serviceId: string;
    priceType: "FIXED" | "FROM" | "RANGE" | "HOURLY" | "ON_QUOTE";
    priceMin: number | null;
    priceMax: number | null;
    priceUnit: string | null;
  }[],
): Promise<Result> {
  return guarded(providerId, async (tx) => {
    for (const item of items) {
      // updateMany scoped by providerId: a serviceId the provider doesn't offer is ignored.
      await tx.providerService.updateMany({
        where: { providerId, serviceId: item.serviceId },
        data: { priceType: item.priceType, priceMin: item.priceMin, priceMax: item.priceMax, priceUnit: item.priceUnit, pricedAt: new Date() },
      });
    }
  });
}

async function connectSource(db: Db, providerId: string) {
  const profile = await db.providerProfile.findUniqueOrThrow({
    where: { providerId },
    select: {
      phone: true,
      whatsapp: true,
      website: true,
      email: true,
      bookingUrl: true,
      rideUrl: true,
      addressText: true,
      latitude: true,
      longitude: true,
      locationVisibility: true,
      enabledActions: true,
      primaryLocation: { select: { name: true } },
    },
  });
  return {
    ...profile,
    latitude: profile.latitude == null ? null : Number(profile.latitude),
    longitude: profile.longitude == null ? null : Number(profile.longitude),
    areaName: profile.primaryLocation?.name ?? null,
  };
}

/** When contact data is removed, the button that depended on it goes too. */
async function dropUnavailableActions(tx: Prisma.TransactionClient, providerId: string) {
  const src = await connectSource(tx, providerId);
  const kept = src.enabledActions.filter((a) => isActionAvailable(a, src));
  if (kept.length !== src.enabledActions.length) {
    await tx.providerProfile.update({ where: { providerId }, data: { enabledActions: kept } });
  }
}

/**
 * Saves which buttons appear, together with the booking links they may need. Links are saved
 * even when their button is off, so a provider can prepare them first.
 */
export async function saveActions(
  providerId: string,
  actions: ConnectAction[],
  links: { bookingUrl?: string | null; rideUrl?: string | null } = {},
): Promise<Result> {
  const current = await connectSource(prisma, providerId);
  const src = {
    ...current,
    bookingUrl: links.bookingUrl !== undefined ? links.bookingUrl : current.bookingUrl,
    rideUrl: links.rideUrl !== undefined ? links.rideUrl : current.rideUrl,
  };
  if (actions.some((a) => !isActionAvailable(a, src))) return { ok: false, error: "actionUnavailable" };
  return guarded(providerId, async (tx) => {
    await tx.providerProfile.update({
      where: { providerId },
      data: { enabledActions: [...new Set(actions)], bookingUrl: src.bookingUrl, rideUrl: src.rideUrl },
    });
  });
}

export async function recordOnboardingStep(providerId: string, stepIndex: number): Promise<void> {
  await prisma.providerProfile.updateMany({
    where: { providerId, onboardingStep: { lt: stepIndex } },
    data: { onboardingStep: stepIndex },
  });
}

/** DRAFT → ACTIVE when everything required is present. Suspended or under-review providers can't self-publish. */
export async function publishProvider(providerId: string): Promise<Result> {
  const p = await prisma.provider.findUniqueOrThrow({ where: { id: providerId }, select: { status: true } });
  if (p.status === "SUSPENDED" || p.status === "PENDING_REVIEW") return { ok: false, error: "notAllowed" };
  if (p.status === "ACTIVE") return { ok: true };
  if (!computeCompletion(await completionSnapshot(prisma, providerId)).canPublish) return { ok: false, error: "cannotPublish" };
  await prisma.provider.update({ where: { id: providerId }, data: { status: "ACTIVE", publishedAt: new Date() } });
  return { ok: true };
}

/** Provider hides their own profile. Admin suspension is separate and can't be undone here. */
export async function unpublishProvider(providerId: string): Promise<Result> {
  const updated = await prisma.provider.updateMany({ where: { id: providerId, status: "ACTIVE" }, data: { status: "DRAFT" } });
  return updated.count === 1 ? { ok: true } : { ok: false, error: "notAllowed" };
}
