import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";
import { computeCompletion } from "@/lib/provider/completion";
import { actionHref, openerText, requestQuoteHref, visibleActions, type ConnectAction } from "@/lib/provider/connect";
import { completionSnapshot } from "@/lib/services/providerProfile";
import { distanceKm, publicPoint, type Point } from "@/lib/geo";

// Read side for provider screens and the public profile. DTOs only: exact coordinates never
// leave this file, and the street address is only returned when the provider chose to show it.

export const getEditorData = cache(async (providerId: string) => {
  const p = await prisma.provider.findUniqueOrThrow({
    where: { id: providerId },
    select: {
      id: true,
      slug: true,
      status: true,
      publishedAt: true,
      profile: {
        select: {
          displayName: true,
          description: true,
          phone: true,
          whatsapp: true,
          email: true,
          website: true,
          bookingUrl: true,
          rideUrl: true,
          addressText: true,
          primaryLocationId: true,
          primaryCategoryId: true,
          locationVisibility: true,
          latitude: true,
          longitude: true,
          serviceRadiusKm: true,
          openingHoursMode: true,
          hoursNote: true,
          enabledActions: true,
          onboardingStep: true,
          primaryLocation: { select: { name: true } },
        },
      },
      services: {
        orderBy: { createdAt: "asc" },
        select: {
          serviceId: true,
          priceType: true,
          priceMin: true,
          priceMax: true,
          priceUnit: true,
          service: { select: { nameEn: true, nameSw: true } },
        },
      },
      serviceAreas: { select: { locationId: true } },
      openingHours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }], select: { dayOfWeek: true, opensAt: true, closesAt: true } },
      media: { orderBy: { sortOrder: "asc" }, select: { id: true, kind: true, storageKey: true, width: true, height: true } },
      socialLinks: { select: { platform: true, url: true } },
    },
  });
  const completion = computeCompletion(await completionSnapshot(prisma, providerId));
  return {
    ...p,
    // Decimals → plain numbers so they can cross into client components.
    profile: p.profile
      ? {
          ...p.profile,
          latitude: p.profile.latitude == null ? null : Number(p.profile.latitude),
          longitude: p.profile.longitude == null ? null : Number(p.profile.longitude),
        }
      : null,
    media: p.media.map(({ storageKey, ...m }) => ({ ...m, url: mediaUrl(storageKey) })),
    completion,
  };
});

export type EditorData = Awaited<ReturnType<typeof getEditorData>>;

export const getCategoryOptions = cache(() =>
  prisma.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      nameEn: true,
      nameSw: true,
      children: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, nameEn: true, nameSw: true } },
    },
  }),
);

/** All active services grouped by the category they belong to (leaf categories). */
export const getServiceOptions = cache(() =>
  prisma.category.findMany({
    where: { isActive: true, services: { some: { isActive: true } } },
    orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      parentId: true,
      nameEn: true,
      nameSw: true,
      services: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, nameEn: true, nameSw: true } },
    },
  }),
);

/** Districts of Dar es Salaam with their areas, for location and service-area pickers. */
export const getAreaOptions = cache(() =>
  prisma.location.findMany({
    where: { type: "DISTRICT", isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      children: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, latitude: true, longitude: true } },
    },
  }).then((ds) =>
    ds.map((d) => ({
      ...d,
      latitude: d.latitude == null ? null : Number(d.latitude),
      longitude: d.longitude == null ? null : Number(d.longitude),
      children: d.children.map((c) => ({ ...c, latitude: c.latitude == null ? null : Number(c.latitude), longitude: c.longitude == null ? null : Number(c.longitude) })),
    })),
  ),
);

/**
 * Public profile. Returns null unless the profile is live, or the viewer owns it / is an admin
 * (then `preview` is true and the page says it isn't public).
 */
export async function getPublicProfile(
  slug: string,
  viewer: { id: string; role: string } | null,
  origin: Point | null = null,
  locale: "sw" | "en" = "sw",
) {
  const p = await prisma.provider.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      status: true,
      deletedAt: true,
      ratingAvg: true,
      ratingCount: true,
      verificationLevel: { select: { nameEn: true, nameSw: true, descriptionEn: true, descriptionSw: true } },
      members: { select: { userId: true } },
      profile: {
        select: {
          displayName: true,
          description: true,
          phone: true,
          whatsapp: true,
          email: true,
          website: true,
          bookingUrl: true,
          rideUrl: true,
          addressText: true,
          latitude: true,
          longitude: true,
          serviceRadiusKm: true,
          locationVisibility: true,
          openingHoursMode: true,
          hoursNote: true,
          enabledActions: true,
          primaryCategory: { select: { nameEn: true, nameSw: true, parent: { select: { nameEn: true, nameSw: true } } } },
          primaryLocation: { select: { name: true, type: true, latitude: true, longitude: true, parent: { select: { name: true } } } },
        },
      },
      services: {
        orderBy: { createdAt: "asc" },
        select: {
          priceType: true,
          priceMin: true,
          priceMax: true,
          priceUnit: true,
          service: { select: { id: true, nameEn: true, nameSw: true } },
        },
      },
      serviceAreas: { select: { location: { select: { id: true, name: true, type: true } } } },
      openingHours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }], select: { dayOfWeek: true, opensAt: true, closesAt: true } },
      media: { orderBy: { sortOrder: "asc" }, select: { id: true, kind: true, storageKey: true, width: true, height: true } },
      socialLinks: { select: { platform: true, url: true } },
    },
  });
  if (!p || p.deletedAt || !p.profile) return null;

  const isOwner = !!viewer && p.members.some((m) => m.userId === viewer.id);
  const isAdmin = viewer?.role === "ADMIN" || viewer?.role === "SUPER_ADMIN";
  if (p.status !== "ACTIVE" && !isOwner && !isAdmin) return null;

  const pr = p.profile;
  const showAddress = pr.locationVisibility === "EXACT";
  const pin = pr.latitude != null && pr.longitude != null ? { lat: Number(pr.latitude), lng: Number(pr.longitude) } : null;
  const areaCentre =
    pr.primaryLocation?.latitude != null && pr.primaryLocation.longitude != null
      ? { lat: Number(pr.primaryLocation.latitude), lng: Number(pr.primaryLocation.longitude) }
      : null;
  // The only position that leaves the server (ADR-006): exact, snapped, or the area centre.
  const pub = publicPoint(pr.locationVisibility, pin, areaCentre);
  const source = {
    phone: pr.phone,
    whatsapp: pr.whatsapp,
    website: pr.website,
    email: pr.email,
    bookingUrl: pr.bookingUrl,
    rideUrl: pr.rideUrl,
    addressText: showAddress ? pr.addressText : null,
    latitude: showAddress && pin ? pin.lat : null,
    longitude: showAddress && pin ? pin.lng : null,
    locationVisibility: pr.locationVisibility,
    areaName: pr.primaryLocation?.name ?? null,
  };
  const actions: ConnectAction[] = visibleActions(pr.enabledActions, source);
  const media = p.media.map(({ storageKey, ...m }) => ({ ...m, url: mediaUrl(storageKey) }));

  return {
    id: p.id,
    slug: p.slug,
    status: p.status,
    rating: { avg: p.ratingAvg, count: p.ratingCount },
    verificationLevel: p.verificationLevel,
    preview: p.status !== "ACTIVE",
    isOwner,
    displayName: pr.displayName,
    description: pr.description,
    category: pr.primaryCategory,
    area: pr.primaryLocation
      ? { name: pr.primaryLocation.name, district: pr.primaryLocation.type === "DISTRICT" ? null : pr.primaryLocation.parent?.name ?? null }
      : null,
    addressText: source.addressText,
    mapPoint: pub ? { ...pub.point, precision: pub.precision } : null,
    distance: origin && pub ? { km: distanceKm(origin, pub.point), precision: pub.precision } : null,
    serviceRadiusKm: pr.serviceRadiusKm,
    // Contact details are only exposed for the buttons the provider switched on.
    contact: {
      phone: actions.includes("CALL") ? pr.phone : null,
      whatsapp: actions.includes("WHATSAPP") ? pr.whatsapp : null,
      website: actions.includes("WEBSITE") ? pr.website : null,
      email: actions.includes("EMAIL") ? pr.email : null,
    },
    // Hrefs are built here so numbers for buttons that are switched off never reach the page.
    // WhatsApp/SMS open with a short "found you on NEXA" greeting. REQUEST_QUOTE opens the
    // in-app request form addressed to this provider.
    actions: actions.map((action) => ({
      action,
      href: action === "REQUEST_QUOTE" ? requestQuoteHref(p.slug) : actionHref(action, source, openerText(locale, pr.displayName)),
    })),
    services: p.services.map((s) => ({ ...s.service, priceType: s.priceType, priceMin: s.priceMin, priceMax: s.priceMax, priceUnit: s.priceUnit })),
    serviceAreas: p.serviceAreas.map((a) => a.location),
    openingHoursMode: pr.openingHoursMode,
    openingHours: p.openingHours,
    hoursNote: pr.hoursNote,
    logo: media.find((m) => m.kind === "LOGO") ?? null,
    cover: media.find((m) => m.kind === "COVER") ?? null,
    gallery: media.filter((m) => m.kind === "GALLERY"),
    socialLinks: p.socialLinks,
  };
}

export type PublicProfile = NonNullable<Awaited<ReturnType<typeof getPublicProfile>>>;
