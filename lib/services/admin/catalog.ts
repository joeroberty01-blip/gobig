import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/services/audit";
import { slugify } from "@/lib/provider/format";
import { inServiceRegion } from "@/lib/geo";

// Admin: catalogue and locations (Phase 12). Nothing is ever deleted — categories, services and
// areas are switched off (isActive) so providers' existing choices and old links keep working.
// Slugs are fixed at creation: renaming never breaks a URL.

export type CatalogError = "notFound" | "slugTaken" | "parentInvalid" | "pinOutsideArea";
export type CResult<T = object> = ({ ok: true } & T) | { ok: false; error: CatalogError };
type Tx = Prisma.TransactionClient;

async function uniqueSlug(tx: Tx, model: "category" | "service" | "location", name: string): Promise<string> {
  const base = slugify(name) || "item";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken =
      model === "category"
        ? await tx.category.count({ where: { slug } })
        : model === "service"
          ? await tx.service.count({ where: { slug } })
          : await tx.location.count({ where: { slug } });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export type CategoryInput = { nameEn: string; nameSw: string; icon: string | null; sortOrder: number; isActive: boolean; parentId: string | null };

export async function saveCategory(actorId: string, id: string | null, input: CategoryInput): Promise<CResult<{ id: string }>> {
  return prisma.$transaction(async (tx) => {
    if (input.parentId) {
      // Two levels only: a subcategory's parent must be a top-level category, and not itself.
      const parent = await tx.category.findUnique({ where: { id: input.parentId }, select: { parentId: true } });
      if (!parent || parent.parentId || input.parentId === id) return { ok: false as const, error: "parentInvalid" as const };
    }
    let savedId: string;
    if (id) {
      const existing = await tx.category.findUnique({ where: { id }, select: { id: true, _count: { select: { children: true } } } });
      if (!existing) return { ok: false as const, error: "notFound" as const };
      if (input.parentId && existing._count.children > 0) return { ok: false as const, error: "parentInvalid" as const };
      await tx.category.update({ where: { id }, data: input });
      savedId = id;
    } else {
      savedId = (await tx.category.create({ data: { ...input, slug: await uniqueSlug(tx, "category", input.nameEn) }, select: { id: true } })).id;
    }
    await audit(tx, { actorId, action: "category.saved", entityType: "Category", entityId: savedId, metadata: { created: !id, nameEn: input.nameEn, isActive: input.isActive } });
    return { ok: true as const, id: savedId };
  });
}

export type ServiceInput = { categoryId: string; nameEn: string; nameSw: string; keywords: string[]; sortOrder: number; isActive: boolean };

export async function saveService(actorId: string, id: string | null, input: ServiceInput): Promise<CResult<{ id: string }>> {
  return prisma.$transaction(async (tx) => {
    if (!(await tx.category.count({ where: { id: input.categoryId } }))) return { ok: false as const, error: "parentInvalid" as const };
    let savedId: string;
    if (id) {
      if (!(await tx.service.count({ where: { id } }))) return { ok: false as const, error: "notFound" as const };
      await tx.service.update({ where: { id }, data: input });
      savedId = id;
    } else {
      savedId = (await tx.service.create({ data: { ...input, slug: await uniqueSlug(tx, "service", input.nameEn) }, select: { id: true } })).id;
    }
    await audit(tx, { actorId, action: "service.saved", entityType: "Service", entityId: savedId, metadata: { created: !id, nameEn: input.nameEn, isActive: input.isActive } });
    return { ok: true as const, id: savedId };
  });
}

export type LocationInput = { name: string; parentId: string; latitude: number | null; longitude: number | null; isActive: boolean };

/** Areas live under a district (same type as the seeded ones, NEIGHBOURHOOD). Coordinates must be inside Dar es Salaam. */
export async function saveLocation(actorId: string, id: string | null, input: LocationInput): Promise<CResult<{ id: string }>> {
  if ((input.latitude == null) !== (input.longitude == null)) return { ok: false, error: "pinOutsideArea" };
  if (input.latitude != null && !inServiceRegion({ lat: input.latitude, lng: input.longitude! })) return { ok: false, error: "pinOutsideArea" };
  return prisma.$transaction(async (tx) => {
    const parent = await tx.location.findUnique({ where: { id: input.parentId }, select: { type: true } });
    if (!parent || parent.type !== "DISTRICT") return { ok: false as const, error: "parentInvalid" as const };
    const data = { name: input.name, parentId: input.parentId, latitude: input.latitude, longitude: input.longitude, isActive: input.isActive };
    let savedId: string;
    if (id) {
      const existing = await tx.location.findUnique({ where: { id }, select: { type: true } });
      if (!existing || existing.type === "DISTRICT" || existing.type === "REGION" || existing.type === "COUNTRY") return { ok: false as const, error: "notFound" as const };
      await tx.location.update({ where: { id }, data });
      savedId = id;
    } else {
      savedId = (await tx.location.create({ data: { ...data, type: "NEIGHBOURHOOD", slug: await uniqueSlug(tx, "location", input.name) }, select: { id: true } })).id;
    }
    await audit(tx, { actorId, action: "location.saved", entityType: "Location", entityId: savedId, metadata: { created: !id, name: input.name, isActive: input.isActive } });
    return { ok: true as const, id: savedId };
  });
}

export async function catalogForAdmin() {
  return prisma.category.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameSw: true,
      icon: true,
      sortOrder: true,
      isActive: true,
      services: { orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, nameEn: true, nameSw: true, keywords: true, sortOrder: true, isActive: true, categoryId: true, _count: { select: { providers: true } } } },
      children: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameSw: true,
          icon: true,
          sortOrder: true,
          isActive: true,
          parentId: true,
          services: { orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, nameEn: true, nameSw: true, keywords: true, sortOrder: true, isActive: true, categoryId: true, _count: { select: { providers: true } } } },
        },
      },
    },
  });
}

export async function locationsForAdmin() {
  const districts = await prisma.location.findMany({
    where: { type: "DISTRICT" },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      isActive: true,
      children: { orderBy: { name: "asc" }, select: { id: true, slug: true, name: true, type: true, isActive: true, latitude: true, longitude: true, _count: { select: { providers: true } } } },
    },
  });
  return districts.map((d) => ({
    ...d,
    children: d.children.map((c) => ({ ...c, latitude: c.latitude == null ? null : Number(c.latitude), longitude: c.longitude == null ? null : Number(c.longitude) })),
  }));
}
