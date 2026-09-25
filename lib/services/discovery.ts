import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { mediaUrl } from "@/lib/storage";
import { availability, isAvailableNow, type Availability } from "@/lib/provider/availability";
import { actionHref, visibleActions, type ConnectAction } from "@/lib/provider/connect";
import type { PriceType } from "@/lib/provider/format";
import { distanceKm, nearestArea, publicPoint, type Point, type Precision } from "@/lib/geo";
import { trustBadges, type TrustBadge } from "@/lib/provider/trust";
import { computeCompletion } from "@/lib/provider/completion";
import {
  availabilityScore,
  compareScored,
  completenessScore,
  distanceScore,
  locationScore,
  ratingScore,
  rankScore,
  recentActivityScore,
  relevanceScore,
  responseRateScore,
  responseTimeScore,
  reviewQualityScore,
  serviceAreaScore,
  verificationScore,
  type SignalValues,
  type Weights,
} from "@/lib/ranking/engine";
import { getWeights, maxVerificationRank, providerStats, publicMedianResponse, type ProviderStats } from "@/lib/services/ranking";
import {
  AreaTier,
  areaTier,
  extractArea,
  PAGE_SIZE,
  queryTokens,
  type AreaContext,
  type SearchParams,
} from "@/lib/discovery/query";

// Customer discovery (Phase 3). Framework-free so it is integration-tested directly.
// Everything shown comes from provider data; nothing is estimated or filled in.

/**
 * Minimum pg_trgm word similarity for a fuzzy match (exact whole-word hits score 1). Measured:
 * real typos score ≥ 0.7 ("plumbr"→"plumber" 0.71, "mechanik"→"mechanic" 0.78) while unrelated
 * phrases sharing one word score 0.5 ("fundi bomba"→"fundi AC"), so 0.55 separates them.
 */
const MATCH_THRESHOLD = 0.55;
/** Upper bound on candidates ranked in memory. Plenty for launch; Phase 13 moves ranking to SQL. */
const CANDIDATE_LIMIT = 500;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/**
 * Combines a whole-phrase match with an every-word match: a result must match the full phrase,
 * or match each meaningful word on its own (score = its weakest word). This keeps "fundi AC" from
 * returning plumbers just because "fundi bomba" shares the word "fundi".
 */
async function matchAllWords(q: string, match: (text: string) => Promise<Map<string, number>>): Promise<Map<string, number>> {
  const phrase = await match(q);
  const tokens = queryTokens(q);
  if (tokens.length < 2) return phrase;
  const perToken = await Promise.all(tokens.map(match));
  // With several words, only an exact whole-phrase hit counts on its own; fuzzy matching is per word.
  const combined = new Map([...phrase].filter(([, score]) => score >= 1));
  for (const [id, first] of perToken[0]!) {
    let score = first;
    for (const m of perToken.slice(1)) score = Math.min(score, m.get(id) ?? 0);
    if (score >= MATCH_THRESHOLD) combined.set(id, Math.max(combined.get(id) ?? 0, score));
  }
  return combined;
}

export function matchServices(q: string): Promise<Map<string, number>> {
  return matchAllWords(q, matchServiceText);
}

export function matchProviderNames(q: string): Promise<Map<string, number>> {
  return matchAllWords(q, matchProviderNameText);
}

/** Services matching one piece of text via their names, keywords or (sub)category names. */
async function matchServiceText(q: string): Promise<Map<string, number>> {
  const text = q.toLowerCase();
  const word = `\\m${escapeRegex(text)}\\M`;
  const rows = await prisma.$queryRaw<{ id: string; score: number }[]>(Prisma.sql`
    SELECT id, score FROM (
      SELECT s.id,
        CASE WHEN lower(s."nameEn") ~ ${word} OR lower(s."nameSw") ~ ${word}
               OR EXISTS (SELECT 1 FROM unnest(s.keywords) k WHERE lower(k) ~ ${word})
             THEN 1.0
             -- Words under 4 letters ("ac", "tv") have too few trigrams to compare fuzzily: exact only.
             WHEN length(${text}) < 4 THEN 0
             ELSE GREATEST(
               word_similarity(${text}, lower(s."nameEn")),
               word_similarity(${text}, lower(s."nameSw")),
               COALESCE((SELECT max(word_similarity(${text}, lower(k))) FROM unnest(s.keywords) k), 0),
               0.85 * GREATEST(word_similarity(${text}, lower(c."nameEn")), word_similarity(${text}, lower(c."nameSw"))),
               0.75 * COALESCE(GREATEST(word_similarity(${text}, lower(pc."nameEn")), word_similarity(${text}, lower(pc."nameSw"))), 0)
             )
        END AS score
      FROM "Service" s
      JOIN "Category" c ON c.id = s."categoryId"
      LEFT JOIN "Category" pc ON pc.id = c."parentId"
      WHERE s."isActive"
    ) m
    WHERE score >= ${MATCH_THRESHOLD}
  `);
  return new Map(rows.map((r) => [r.id, Number(r.score)]));
}

/** Live providers whose business name matches one piece of text. */
async function matchProviderNameText(q: string): Promise<Map<string, number>> {
  const text = q.toLowerCase();
  const word = `\\m${escapeRegex(text)}\\M`;
  const rows = await prisma.$queryRaw<{ id: string; score: number }[]>(Prisma.sql`
    SELECT id, score FROM (
      SELECT p."providerId" AS id,
        CASE WHEN lower(p."displayName") ~ ${word} THEN 1.0 WHEN length(${text}) < 4 THEN 0 ELSE word_similarity(${text}, lower(p."displayName")) END AS score
      FROM "ProviderProfile" p
      JOIN "Provider" pr ON pr.id = p."providerId"
      WHERE pr.status = 'ACTIVE' AND pr."deletedAt" IS NULL
    ) m
    WHERE score >= ${MATCH_THRESHOLD}
  `);
  return new Map(rows.map((r) => [r.id, Number(r.score)]));
}

export type AreaInfo = { slug: string; name: string; districtName: string | null; ctx: AreaContext };

export async function resolveArea(slug: string | null): Promise<AreaInfo | null> {
  if (!slug) return null;
  const loc = await prisma.location.findFirst({
    where: { slug, isActive: true, type: { in: ["DISTRICT", "WARD", "NEIGHBOURHOOD"] } },
    select: { id: true, slug: true, name: true, type: true, parent: { select: { id: true, name: true, type: true } } },
  });
  if (!loc) return null;
  const isDistrict = loc.type === "DISTRICT";
  const districtId = isDistrict ? loc.id : (loc.parent?.id ?? loc.id);
  const children = await prisma.location.findMany({ where: { parentId: districtId }, select: { id: true } });
  const districtAreaIds = new Set(children.map((c) => c.id));
  const serveIds = isDistrict ? new Set([loc.id, ...districtAreaIds]) : new Set([loc.id, districtId]);
  return {
    slug: loc.slug,
    name: loc.name,
    districtName: isDistrict ? null : (loc.parent?.name ?? null),
    ctx: { areaId: loc.id, districtId, districtAreaIds, serveIds },
  };
}

/** All selectable areas (districts and the areas inside them), for query parsing and pickers. */
export async function listAreas() {
  return prisma.location.findMany({
    where: { isActive: true, type: { in: ["DISTRICT", "WARD", "NEIGHBOURHOOD"] } },
    select: { slug: true, name: true, type: true },
  });
}

export type ProviderCard = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  category: { nameEn: string; nameSw: string } | null;
  area: { name: string; district: string | null } | null;
  service: { nameEn: string; nameSw: string } | null;
  price: { priceType: PriceType; priceMin: number | null; priceMax: number | null; priceUnit: string | null } | null;
  availability: Availability;
  actions: { action: ConnectAction; href: string }[];
  tier: AreaTier | null;
  /** Distance to the provider's *public* point, stated no more precisely than that point allows. */
  distance: { km: number; precision: Precision; from: "you" | "area" } | null;
  /** The provider's public map position (ADR-006): exact, snapped, or their area's centre. */
  mapPoint: { lat: number; lng: number; precision: Precision } | null;
  rating: { avg: number | null; count: number };
  /** Earned trust signals only (lib/provider/trust.ts) — never paid ones. */
  badges: TrustBadge[];
};

/** Where distances are measured from: the customer's shared position, or their chosen area's centre. */
export type Origin = { kind: "you" | "area"; point: Point };

/** Without an area filter, a shared position shows providers within this distance (or serving it). */
export const NEARBY_KM = 15;
/** Map view shows at most this many results at once. */
export const MAP_LIMIT = 200;

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d));
const toPoint = (lat: Prisma.Decimal | null | undefined, lng: Prisma.Decimal | null | undefined): Point | null =>
  lat == null || lng == null ? null : { lat: Number(lat), lng: Number(lng) };

const cardSelect = {
  id: true,
  slug: true,
  publishedAt: true,
  ratingAvg: true,
  ratingCount: true,
  verificationLevel: { select: { nameEn: true, nameSw: true, rank: true } },
  profile: {
    select: {
      displayName: true,
      description: true,
      primaryCategoryId: true,
      updatedAt: true,
      primaryLocationId: true,
      phone: true,
      whatsapp: true,
      website: true,
      email: true,
      addressText: true,
      latitude: true,
      longitude: true,
      serviceRadiusKm: true,
      locationVisibility: true,
      openingHoursMode: true,
      enabledActions: true,
      primaryCategory: { select: { nameEn: true, nameSw: true } },
      primaryLocation: { select: { name: true, type: true, latitude: true, longitude: true, parent: { select: { name: true } } } },
    },
  },
  services: {
    orderBy: { createdAt: "asc" },
    select: {
      serviceId: true,
      pricedAt: true,
      priceType: true,
      priceMin: true,
      priceMax: true,
      priceUnit: true,
      service: { select: { slug: true, nameEn: true, nameSw: true } },
    },
  },
  serviceAreas: { select: { locationId: true } },
  openingHours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
  media: { where: { kind: { in: ["LOGO", "COVER"] } }, select: { kind: true, storageKey: true } },
  // For the profile-completeness ranking signal.
  _count: { select: { openingHours: true, socialLinks: true, media: { where: { kind: "GALLERY" } } } },
} satisfies Prisma.ProviderSelect;

type CandidateRow = Prisma.ProviderGetPayload<{ select: typeof cardSelect }>;

/** Only the buttons a card has room for: the direct ones. The profile page shows the rest. */
const CARD_ACTIONS: ConnectAction[] = ["CALL", "WHATSAPP"];

function toCard(
  p: CandidateRow,
  opts: {
    serviceScores: Map<string, number> | null;
    serviceSlug: string | null;
    area: AreaInfo | null;
    origin: Origin | null;
    now: Date;
    stats: ProviderStats | undefined;
  },
): ProviderCard & { relevanceService: number; publishedAt: Date | null; completeness: number; lastActive: Date | null } {
  const pr = p.profile!;
  // Which service the card talks about: the one searched for, else the best text match, else the
  // first one with a price, else the first one.
  const chosen =
    (opts.serviceSlug && p.services.find((s) => s.service.slug === opts.serviceSlug)) ||
    (opts.serviceScores &&
      [...p.services].filter((s) => opts.serviceScores!.has(s.serviceId)).sort((a, b) => opts.serviceScores!.get(b.serviceId)! - opts.serviceScores!.get(a.serviceId)!)[0]) ||
    p.services.find((s) => s.priceType !== "ON_QUOTE") ||
    p.services[0] ||
    null;
  const pin = toPoint(pr.latitude, pr.longitude);
  const areaCentre = toPoint(pr.primaryLocation?.latitude, pr.primaryLocation?.longitude);
  const pub = publicPoint(pr.locationVisibility, pin, areaCentre);
  const src = {
    phone: pr.phone,
    whatsapp: pr.whatsapp,
    website: pr.website,
    email: pr.email,
    addressText: pr.locationVisibility === "EXACT" ? pr.addressText : null,
    latitude: pr.locationVisibility === "EXACT" ? num(pr.latitude) : null,
    longitude: pr.locationVisibility === "EXACT" ? num(pr.longitude) : null,
    locationVisibility: pr.locationVisibility,
    areaName: pr.primaryLocation?.name ?? null,
  };
  const actions = visibleActions(pr.enabledActions, src)
    .filter((a) => CARD_ACTIONS.includes(a))
    .map((action) => ({ action, href: actionHref(action, src)! }));
  const media = (kind: "LOGO" | "COVER") => {
    const m = p.media.find((x) => x.kind === kind);
    return m ? mediaUrl(m.storageKey) : null;
  };

  const avail = availability(pr.openingHoursMode, p.openingHours, opts.now);
  let tier = opts.area ? areaTier({ primaryLocationId: pr.primaryLocationId, serviceAreaIds: p.serviceAreas.map((a) => a.locationId) }, opts.area.ctx) : null;
  // A travel radius covers the customer when their position (or area centre) is within it.
  // Measured from the provider's PUBLIC point, never the private pin: otherwise anyone could move
  // their own position and watch the covered/not-covered edge to trace a home-based provider's
  // exact location (SEC-020). Costs at most ~0.5 km of accuracy for approximate providers.
  if (opts.origin && pub && pr.serviceRadiusKm && distanceKm(pub.point, opts.origin.point) <= pr.serviceRadiusKm) {
    tier = tier == null ? AreaTier.ServesArea : Math.min(tier, AreaTier.ServesArea);
  }

  return {
    id: p.id,
    slug: p.slug,
    name: pr.displayName,
    logoUrl: media("LOGO"),
    coverUrl: media("COVER"),
    category: pr.primaryCategory,
    area: pr.primaryLocation
      ? { name: pr.primaryLocation.name, district: pr.primaryLocation.type === "DISTRICT" ? null : (pr.primaryLocation.parent?.name ?? null) }
      : null,
    service: chosen ? chosen.service : null,
    price: chosen ? { priceType: chosen.priceType, priceMin: chosen.priceMin, priceMax: chosen.priceMax, priceUnit: chosen.priceUnit } : null,
    availability: avail,
    actions,
    tier,
    rating: { avg: p.ratingAvg, count: p.ratingCount },
    badges: trustBadges({
      verificationLevel: p.verificationLevel,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      availability: avail,
      medianResponseMinutes: publicMedianResponse(opts.stats),
    }),
    distance: opts.origin && pub ? { km: distanceKm(opts.origin.point, pub.point), precision: pub.precision, from: opts.origin.kind } : null,
    mapPoint: pub ? { ...pub.point, precision: pub.precision } : null,
    relevanceService: chosen && opts.serviceScores ? (opts.serviceScores.get(chosen.serviceId) ?? 0) : 0,
    publishedAt: p.publishedAt,
    completeness: computeCompletion({
      displayName: pr.displayName,
      primaryCategoryId: pr.primaryCategoryId,
      serviceCount: p.services.length,
      pricedServiceCount: p.services.filter((s) => s.pricedAt !== null).length,
      description: pr.description,
      phone: pr.phone,
      whatsapp: pr.whatsapp,
      website: pr.website,
      socialCount: p._count.socialLinks,
      primaryLocationId: pr.primaryLocationId,
      serviceAreaCount: p.serviceAreas.length,
      openingHoursMode: pr.openingHoursMode,
      openingHoursCount: p._count.openingHours,
      hasLogo: p.media.some((m) => m.kind === "LOGO"),
      hasCover: p.media.some((m) => m.kind === "COVER"),
      galleryCount: p._count.media,
      enabledActionCount: pr.enabledActions.length,
    }).percent,
    lastActive: maxDate(pr.updatedAt, opts.stats?.lastResponseAt ?? null),
  };
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Ranking explanation for the admin preview: the total and each normalised signal. */
export type RankExplain = { score: number; breakdown: SignalValues };

export type SearchResult = {
  results: ProviderCard[];
  total: number;
  page: number;
  pages: number;
  area: AreaInfo | null;
  /** True when the area was worked out from the customer's shared position. */
  areaFromPosition: boolean;
  origin: Origin | null;
  /** Area recognised inside the text query ("… Mikocheni"), when no area filter was given. */
  detectedArea: string | null;
  /** Text actually searched after removing a recognised area name. */
  effectiveQuery: string;
  categoryName: { nameEn: string; nameSw: string } | null;
  serviceName: { nameEn: string; nameSw: string } | null;
  /** The service and area actually filtered by (ids), for analytics. */
  filterIds: { serviceId: string | null; locationId: string | null };
  /** Every matching provider in ranked order (all pages) — sponsored slots may only use these. */
  rankedIds: string[];
  /** Category ids the search covered (the category and its children), for campaign targeting. */
  categoryIds: string[];
  /** The area and its district, for campaign targeting. */
  areaIds: string[];
};

/** Bounding box around a point, for a cheap index-friendly prefilter before exact distances. */
function box(p: Point, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: { gte: p.lat - dLat, lte: p.lat + dLat }, lng: { gte: p.lng - dLng, lte: p.lng + dLng } };
}

async function locatedAreas() {
  const rows = await prisma.location.findMany({
    where: { isActive: true, type: { in: ["WARD", "NEIGHBOURHOOD"] }, latitude: { not: null } },
    select: { slug: true, latitude: true, longitude: true },
  });
  return rows.map((r) => ({ slug: r.slug, lat: num(r.latitude), lng: num(r.longitude) }));
}

/**
 * @param point the customer's shared position (already rounded), used only when no area is chosen
 *   explicitly — an explicit area always wins.
 */
export async function searchProviders(
  params: SearchParams,
  now: Date = new Date(),
  point: Point | null = null,
  opts: { weights?: Weights; explain?: boolean } = {},
): Promise<SearchResult & { explain?: Map<string, RankExplain> }> {
  // A place name inside the text becomes the area filter unless one was chosen explicitly.
  let q = params.q;
  let detectedArea: string | null = null;
  if (q && !params.area) {
    const found = extractArea(q, await listAreas());
    if (found.area) {
      q = found.q;
      detectedArea = found.area;
    }
  }
  const explicitArea = params.area ?? detectedArea;
  const usePoint = !explicitArea && point ? point : null;
  const nearest = usePoint ? nearestArea(usePoint, await locatedAreas()) : null;
  const area = await resolveArea(explicitArea ?? nearest?.slug ?? null);
  const areaCentre = area ? await prisma.location.findUnique({ where: { slug: area.slug }, select: { latitude: true, longitude: true } }) : null;
  const origin: Origin | null = usePoint
    ? { kind: "you", point: usePoint }
    : areaCentre?.latitude != null && areaCentre.longitude != null
      ? { kind: "area", point: { lat: Number(areaCentre.latitude), lng: Number(areaCentre.longitude) } }
      : null;

  const [serviceScores, nameScores] = q ? await Promise.all([matchServices(q), matchProviderNames(q)]) : [null, null];

  const category = params.category
    ? await prisma.category.findFirst({
        where: { slug: params.category, isActive: true },
        select: { id: true, nameEn: true, nameSw: true, children: { select: { id: true } } },
      })
    : null;
  const categoryIds = category ? [category.id, ...category.children.map((c) => c.id)] : null;
  const service = params.service
    ? await prisma.service.findFirst({ where: { slug: params.service, isActive: true }, select: { id: true, nameEn: true, nameSw: true } })
    : null;

  const empty = (): SearchResult => ({
    results: [],
    total: 0,
    page: 1,
    pages: 1,
    area,
    areaFromPosition: !!usePoint && !!area,
    origin,
    detectedArea,
    effectiveQuery: q,
    categoryName: category ? { nameEn: category.nameEn, nameSw: category.nameSw } : null,
    serviceName: service ? { nameEn: service.nameEn, nameSw: service.nameSw } : null,
    filterIds: { serviceId: service?.id ?? null, locationId: area && !usePoint ? area.ctx.areaId : null },
    rankedIds: [],
    categoryIds: categoryIds ?? [],
    areaIds: area ? [area.ctx.areaId, area.ctx.districtId].filter((x): x is string => !!x) : [],
  });
  // An unknown category/service slug, or text that matches nothing, is an honest empty result.
  if ((params.category && !category) || (params.service && !service)) return empty();
  if (q && serviceScores!.size === 0 && nameScores!.size === 0) return empty();

  const and: Prisma.ProviderWhereInput[] = [{ status: "ACTIVE", deletedAt: null, profile: { isNot: null } }];
  if (q) {
    and.push({ OR: [{ services: { some: { serviceId: { in: [...serviceScores!.keys()] } } } }, { id: { in: [...nameScores!.keys()] } }] });
  }
  if (service) and.push({ services: { some: { serviceId: service.id } } });
  if (categoryIds) {
    and.push({ OR: [{ services: { some: { service: { categoryId: { in: categoryIds } } } } }, { profile: { primaryCategoryId: { in: categoryIds } } }] });
  }
  const near: Prisma.ProviderWhereInput[] = [];
  if (area) {
    const { ctx } = area;
    near.push(
      { profile: { primaryLocationId: { in: [ctx.areaId, ctx.districtId, ...ctx.districtAreaIds] } } },
      { serviceAreas: { some: { locationId: { in: [...ctx.serveIds] } } } },
    );
  }
  if (usePoint) {
    // Within NEARBY_KM by their pin or their area's centre, or with a travel radius that may reach
    // the customer (checked exactly per card). The box is a cheap prefilter; exact distances follow.
    const b = box(usePoint, NEARBY_KM);
    near.push(
      { profile: { latitude: b.lat, longitude: b.lng } },
      { profile: { primaryLocation: { latitude: b.lat, longitude: b.lng } } },
      { profile: { serviceRadiusKm: { not: null } } },
    );
  }
  if (near.length) and.push({ OR: near });

  const rows = await prisma.provider.findMany({ where: { AND: and }, select: cardSelect, take: CANDIDATE_LIMIT });
  const [stats, weights, maxRank] = await Promise.all([
    providerStats(rows.map((r) => r.id), now),
    opts.weights ? Promise.resolve(opts.weights) : getWeights(),
    maxVerificationRank(),
  ]);
  const rankOf = new Map(rows.map((r) => [r.id, r.verificationLevel?.rank ?? null]));
  const ratingOf = new Map(rows.map((r) => [r.id, { avg: r.ratingAvg, count: r.ratingCount }]));

  let cards = rows.map((p) => toCard(p, { serviceScores, serviceSlug: params.service, area, origin, now, stats: stats.get(p.id) }));
  if (usePoint) {
    // Keep what's near, or what serves this area / reaches this point.
    cards = cards.filter((c) => (c.tier != null && c.tier <= AreaTier.SameDistrict) || (c.distance != null && c.distance.km <= NEARBY_KM));
  }
  if (params.openNow) cards = cards.filter((c) => isAvailableNow(c.availability));
  if (params.priced) cards = cards.filter((c) => c.price && c.price.priceType !== "ON_QUOTE");

  // Phase 8: every signal comes from provider data; nothing paid is an input (ADR-040).
  const ranked = cards
    .map((c) => {
      const st = stats.get(c.id)!;
      const rating = ratingOf.get(c.id)!;
      const values: SignalValues = {
        serviceRelevance: relevanceScore(q ? Math.max(c.relevanceService, nameScores!.get(c.id) ?? 0) : null),
        locationRelevance: locationScore(area ? (c.tier ?? AreaTier.Elsewhere) : null),
        serviceArea: serviceAreaScore(area || origin ? c.tier != null && c.tier <= AreaTier.ServesArea : null),
        distance: distanceScore(c.distance?.km ?? null, !!origin),
        availability: availabilityScore(c.availability.state),
        verification: verificationScore(rankOf.get(c.id) ?? null, maxRank),
        rating: ratingScore(rating.avg, rating.count),
        reviewQuality: reviewQualityScore(st.reviewsPublished, st.reviewsVerified),
        responseRate: responseRateScore(st.due, st.responded),
        responseTime: responseTimeScore(st.medianResponseMinutes, st.responseSamples),
        profileCompleteness: completenessScore(c.completeness),
        recentActivity: recentActivityScore(c.lastActive, now),
      };
      const scored = rankScore(values, weights);
      return { card: c, id: c.id, publishedAt: c.publishedAt, score: scored.score, scored };
    })
    .sort(compareScored);

  const total = ranked.length;
  const pageSize = params.view === "map" ? MAP_LIMIT : PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(params.page, pages);
  const pageRows = ranked.slice((page - 1) * pageSize, page * pageSize);
  const results = pageRows.map(({ card }) => {
    const { relevanceService: _r, publishedAt: _p, completeness: _c, lastActive: _l, ...rest } = card;
    void _r;
    void _p;
    void _c;
    void _l;
    return rest;
  });
  const explain = opts.explain ? new Map(pageRows.map((r) => [r.id, { score: r.score, breakdown: r.scored.breakdown }])) : undefined;

  return { ...empty(), results, total, page, pages, explain, rankedIds: ranked.map((r) => r.id) };
}

/** Services offered by the most live providers — real counts only; zero-provider services are left out. */
export async function popularServices(limit = 8) {
  const rows = await prisma.$queryRaw<{ slug: string; nameEn: string; nameSw: string; providers: number }[]>(Prisma.sql`
    SELECT s.slug, s."nameEn", s."nameSw", count(DISTINCT ps."providerId")::int AS providers
    FROM "ProviderService" ps
    JOIN "Service" s ON s.id = ps."serviceId"
    JOIN "Provider" p ON p.id = ps."providerId"
    WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND s."isActive"
    GROUP BY s.id
    ORDER BY providers DESC, s."sortOrder", s.slug
    LIMIT ${limit}
  `);
  return rows;
}

export async function topCategories() {
  return prisma.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, nameEn: true, nameSw: true, icon: true },
  });
}

/**
 * Cards for specific live providers (e.g. a customer's saved list), in the given order. Built with
 * the same code as search results, so nothing extra is exposed.
 */
export async function providerCardsByIds(ids: string[], now: Date = new Date()): Promise<ProviderCard[]> {
  if (!ids.length) return [];
  const rows = await prisma.provider.findMany({
    where: { id: { in: ids }, status: "ACTIVE", deletedAt: null, profile: { isNot: null } },
    select: cardSelect,
  });
  const stats = await providerStats(rows.map((r) => r.id), now);
  const byId = new Map(
    rows.map((p) => {
      const { relevanceService: _r, publishedAt: _p, completeness: _c, lastActive: _l, ...card } = toCard(p, {
        serviceScores: null,
        serviceSlug: null,
        area: null,
        origin: null,
        now,
        stats: stats.get(p.id),
      });
      void _r;
      void _p;
      void _c;
      void _l;
      return [p.id, card];
    }),
  );
  return ids.map((id) => byId.get(id)).filter((c): c is ProviderCard => !!c);
}
