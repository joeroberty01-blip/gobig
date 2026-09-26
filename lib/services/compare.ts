import { prisma } from "@/lib/db";
import { MAX_COMPARE } from "@/lib/compare";
import { providerCardsByIds, type ProviderCard } from "@/lib/services/discovery";

export type ComparedProvider = {
  card: ProviderCard;
  services: { nameEn: string; nameSw: string; priceType: "FIXED" | "FROM" | "RANGE" | "HOURLY" | "ON_QUOTE"; priceMin: number | null; priceMax: number | null; priceUnit: string | null }[];
  serviceAreas: string[];
  hoursMode: "SCHEDULE" | "ALWAYS_OPEN" | "BY_APPOINTMENT" | null;
};

/**
 * Side-by-side data for up to three live providers, in the order the customer picked them. Only
 * what their public profiles already show; unpublished, suspended or unknown slugs are dropped.
 * The order is the customer's own — this page never ranks or picks a "winner".
 */
export async function compareProviders(slugs: string[]): Promise<ComparedProvider[]> {
  const wanted = slugs.slice(0, MAX_COMPARE);
  if (!wanted.length) return [];
  const rows = await prisma.provider.findMany({
    where: { slug: { in: wanted }, status: "ACTIVE", deletedAt: null, profile: { isNot: null } },
    select: {
      id: true,
      slug: true,
      profile: { select: { openingHoursMode: true } },
      services: {
        orderBy: { createdAt: "asc" },
        where: { service: { isActive: true } },
        select: { priceType: true, priceMin: true, priceMax: true, priceUnit: true, service: { select: { nameEn: true, nameSw: true } } },
      },
      serviceAreas: { select: { location: { select: { name: true } } } },
    },
  });
  const ordered = wanted.map((slug) => rows.find((r) => r.slug === slug)).filter((r): r is (typeof rows)[number] => !!r);
  const cards = await providerCardsByIds(ordered.map((r) => r.id));
  return ordered
    .map((r) => {
      const card = cards.find((c) => c.id === r.id);
      if (!card) return null;
      return {
        card,
        services: r.services.map((s) => ({ ...s.service, priceType: s.priceType, priceMin: s.priceMin, priceMax: s.priceMax, priceUnit: s.priceUnit })),
        serviceAreas: r.serviceAreas.map((a) => a.location.name),
        hoursMode: r.profile?.openingHoursMode ?? null,
      };
    })
    .filter((x): x is ComparedProvider => !!x);
}
