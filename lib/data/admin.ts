import "server-only";
import { prisma } from "@/lib/db";

// Read side for admin screens. Returns plain DTOs; password hashes never leave this file.

export async function getOverviewCounts() {
  const [byRole, categories, subcategories, services, locations, pendingVerifications, openReports] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.category.count({ where: { parentId: null } }),
    prisma.category.count({ where: { parentId: { not: null } } }),
    prisma.service.count(),
    prisma.location.count(),
    prisma.verificationRequest.count({ where: { status: "SUBMITTED" } }),
    prisma.review.count({ where: { reports: { some: { status: "OPEN" } } } }),
  ]);
  const role = (r: string) => byRole.find((x) => x.role === r)?._count._all ?? 0;
  return {
    customers: role("CUSTOMER"),
    providers: role("PROVIDER"),
    admins: role("ADMIN") + role("SUPER_ADMIN"),
    categories,
    subcategories,
    services,
    locations,
    pendingVerifications,
    openReports,
  };
}
