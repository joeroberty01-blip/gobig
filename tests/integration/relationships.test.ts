import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

// Exercises the Phase 1 entity graph and the database-level rules from the check_constraints
// migration. All rows use a per-run prefix and are removed afterwards.
const run = `t${Date.now().toString(36)}`;

let ownerId: string;
let staffId: string;
let serviceId: string;
let categoryId: string;
let locationId: string;

async function cleanup() {
  await prisma.provider.deleteMany({ where: { slug: { startsWith: run } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: run } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: run }, parentId: { not: null } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: run } } });
  await prisma.location.deleteMany({ where: { slug: { startsWith: run }, parentId: { not: null } } });
  await prisma.location.deleteMany({ where: { slug: { startsWith: run } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${run}.test.gobig.local` } } });
}

beforeAll(async () => {
  await cleanup();
  const u = (n: string, role: "PROVIDER" | "CUSTOMER") =>
    prisma.user.create({ data: { name: n, email: `${n}@${run}.test.gobig.local`, passwordHash: "x", role } });
  ownerId = (await u("owner", "PROVIDER")).id;
  staffId = (await u("staff", "PROVIDER")).id;

  const parent = await prisma.category.create({ data: { slug: `${run}-parent`, nameEn: "Parent", nameSw: "Mzazi" } });
  categoryId = (await prisma.category.create({ data: { slug: `${run}-child`, nameEn: "Child", nameSw: "Mtoto", parentId: parent.id } })).id;
  serviceId = (await prisma.service.create({ data: { slug: `${run}-svc`, nameEn: "Svc", nameSw: "Huduma", categoryId, keywords: ["a", "b"] } })).id;
  const district = await prisma.location.create({ data: { slug: `${run}-district`, name: "D", type: "DISTRICT" } });
  locationId = (await prisma.location.create({ data: { slug: `${run}-area`, name: "A", type: "NEIGHBOURHOOD", parentId: district.id } })).id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("seeded catalogue", () => {
  it("has categories, subcategories, services and Dar es Salaam's five districts", async () => {
    expect(await prisma.category.count({ where: { parentId: null, slug: { not: { startsWith: run } } } })).toBeGreaterThan(5);
    expect(await prisma.category.count({ where: { parent: { slug: "home-repairs" } } })).toBe(5);
    expect(await prisma.service.findUnique({ where: { slug: "ac-repair" }, select: { keywords: true } })).toMatchObject({
      keywords: expect.arrayContaining(["kiyoyozi"]),
    });
    const districts = await prisma.location.findMany({ where: { type: "DISTRICT", parent: { slug: "dar-es-salaam" } } });
    expect(districts.map((d) => d.name).sort()).toEqual(["Ilala", "Kigamboni", "Kinondoni", "Temeke", "Ubungo"]);
    expect(await prisma.location.findUnique({ where: { slug: "mikocheni" }, select: { parent: { select: { name: true } } } })).toMatchObject({
      parent: { name: "Kinondoni" },
    });
  });
});

describe("provider graph", () => {
  it("links provider, owner, profile, services and service areas", async () => {
    const provider = await prisma.provider.create({
      data: {
        slug: `${run}-biz`,
        members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: staffId, role: "STAFF" }] },
        profile: { create: { displayName: "Biz", primaryCategoryId: categoryId, primaryLocationId: locationId } },
        services: { create: [{ serviceId, priceType: "RANGE", priceMin: 20000, priceMax: 50000, priceUnit: "per visit" }] },
        serviceAreas: { create: [{ locationId }] },
      },
      include: { members: true, profile: true, services: true, serviceAreas: true },
    });
    expect(provider.status).toBe("DRAFT");
    expect(provider.profile?.locationVisibility).toBe("AREA_ONLY");
    expect(provider.members).toHaveLength(2);
    expect(provider.services[0]).toMatchObject({ priceMin: 20000, priceMax: 50000 });
    expect(provider.serviceAreas).toHaveLength(1);

    const owned = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, include: { memberships: { include: { provider: true } } } });
    expect(owned.memberships[0]?.provider.slug).toBe(`${run}-biz`);
  });

  it("defaults a service price to ON_QUOTE with no amount", async () => {
    const p = await prisma.provider.create({ data: { slug: `${run}-quote`, services: { create: [{ serviceId }] } }, include: { services: true } });
    expect(p.services[0]).toMatchObject({ priceType: "ON_QUOTE", priceMin: null, priceMax: null });
  });

  it("allows only one OWNER per provider", async () => {
    const p = await prisma.provider.findUniqueOrThrow({ where: { slug: `${run}-quote` } });
    await prisma.providerMember.create({ data: { providerId: p.id, userId: ownerId, role: "OWNER" } });
    await expect(prisma.providerMember.create({ data: { providerId: p.id, userId: staffId, role: "OWNER" } })).rejects.toThrow();
  });

  it("rejects a backwards or negative price range", async () => {
    const p = await prisma.provider.create({ data: { slug: `${run}-price` } });
    await expect(prisma.providerService.create({ data: { providerId: p.id, serviceId, priceMin: 50000, priceMax: 1000 } })).rejects.toThrow();
    await expect(prisma.providerService.create({ data: { providerId: p.id, serviceId, priceMin: -1 } })).rejects.toThrow();
  });

  it("does not list the same service twice for one provider", async () => {
    const p = await prisma.provider.findUniqueOrThrow({ where: { slug: `${run}-biz` } });
    await expect(prisma.providerService.create({ data: { providerId: p.id, serviceId } })).rejects.toThrow();
  });

  it("protects catalogue rows that providers use, and cascades provider deletion", async () => {
    await expect(prisma.service.delete({ where: { id: serviceId } })).rejects.toThrow();
    await expect(prisma.location.delete({ where: { id: locationId } })).rejects.toThrow();

    const p = await prisma.provider.findUniqueOrThrow({ where: { slug: `${run}-biz` } });
    await prisma.provider.delete({ where: { id: p.id } });
    expect(await prisma.providerProfile.count({ where: { providerId: p.id } })).toBe(0);
    expect(await prisma.providerService.count({ where: { providerId: p.id } })).toBe(0);
    expect(await prisma.providerMember.count({ where: { providerId: p.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: ownerId } })).toBe(1);
  });

  it("stops a category from being its own parent", async () => {
    await expect(prisma.category.update({ where: { id: categoryId }, data: { parentId: categoryId } })).rejects.toThrow();
  });
});
