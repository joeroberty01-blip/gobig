import { prisma } from "@/lib/db";
import { memo } from "@/lib/cache";

// Home hero numbers (owner's mockup, 2026-10-06). The mockup's "Trusted by 10,000+" was invented, so
// the home shows only real counts from the database: live businesses (sample businesses excluded),
// how many are verified, and their published reviews. The page hides a number that is zero.

export type HomeStats = { listed: number; verified: number; reviews: number; avgRating: number | null };

const live = { status: "ACTIVE" as const, deletedAt: null, isDemo: false };

export function homeStats(): Promise<HomeStats> {
  return memo("home:stats", 5 * 60_000, async () => {
    const [listed, verified, reviews] = await Promise.all([
      prisma.provider.count({ where: live }),
      prisma.provider.count({ where: { ...live, verificationLevelId: { not: null } } }),
      prisma.review.aggregate({ where: { status: "PUBLISHED", provider: live }, _count: { _all: true }, _avg: { rating: true } }),
    ]);
    return { listed, verified, reviews: reviews._count._all, avgRating: reviews._avg.rating == null ? null : Math.round(reviews._avg.rating * 10) / 10 };
  });
}
