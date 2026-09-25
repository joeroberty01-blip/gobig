import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";
import * as svc from "@/lib/services/providerProfile";
import { deleteProviderImage, MAX_GALLERY, processImage, saveProviderImage } from "@/lib/services/media";

// Full provider onboarding against the test database and test object storage.
const run = `t${Date.now().toString(36)}`;
const email = `${run}@provider.test.gobig.local`;
let userId: string;
let otherUserId: string;
let providerId: string;
let serviceIds: string[];
let categoryId: string;
let mikocheni: string;
let kinondoni: string;

async function jpeg(width: number, height: number, withGps = false) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } }).jpeg();
  if (withGps) img = img.withExif({ IFD0: { Make: "TestPhone" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "6/1 45/1 0/1" } });
  return img.toBuffer();
}

async function cleanup() {
  const providers = await prisma.provider.findMany({ where: { members: { some: { user: { email: { endsWith: `@provider.test.gobig.local` } } } } }, select: { id: true } });
  for (const p of providers) {
    const media = await prisma.mediaAsset.findMany({ where: { providerId: p.id }, select: { id: true } });
    for (const m of media) await deleteProviderImage(p.id, m.id);
  }
  await prisma.provider.deleteMany({ where: { id: { in: providers.map((p) => p.id) } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@provider.test.gobig.local` } } });
}

beforeAll(async () => {
  await cleanup();
  userId = (await prisma.user.create({ data: { name: "Owner", email, passwordHash: "x", role: "PROVIDER" } })).id;
  otherUserId = (await prisma.user.create({ data: { name: "Other", email: `other-${email}`, passwordHash: "x", role: "PROVIDER" } })).id;
  const ac = await prisma.category.findUniqueOrThrow({ where: { slug: "ac-refrigeration" }, include: { services: true } });
  categoryId = ac.id;
  serviceIds = ac.services.map((s) => s.id);
  mikocheni = (await prisma.location.findUniqueOrThrow({ where: { slug: "mikocheni" } })).id;
  kinondoni = (await prisma.location.findUniqueOrThrow({ where: { slug: "kinondoni-district" } })).id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("onboarding", () => {
  it("creates the business on the name step with a unique slug", async () => {
    providerId = (await svc.saveBusinessName(userId, "Juma AC Services")).providerId;
    const other = await svc.saveBusinessName(otherUserId, "Juma AC Services");
    const [a, b] = await Promise.all([
      prisma.provider.findUniqueOrThrow({ where: { id: providerId } }),
      prisma.provider.findUniqueOrThrow({ where: { id: other.providerId } }),
    ]);
    expect(a.slug).toMatch(/^juma-ac-services/);
    expect(b.slug).not.toBe(a.slug);
    expect(a.status).toBe("DRAFT");
    expect(await svc.getOwnedProviderId(userId)).toBe(providerId);
    // Saving the name again renames, it doesn't create a second business.
    await svc.saveBusinessName(userId, `Juma AC ${run}`);
    expect(await prisma.providerMember.count({ where: { userId } })).toBe(1);
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).slug).toBe(`juma-ac-${run}`);
  });

  it("refuses publishing until the required items exist", async () => {
    expect(await svc.publishProvider(providerId)).toEqual({ ok: false, error: "cannotPublish" });
  });

  it("saves each section", async () => {
    expect(await svc.saveCategory(providerId, categoryId)).toEqual({ ok: true });
    expect(await svc.saveCategory(providerId, "nope")).toEqual({ ok: false, error: "categoryRequired" });
    expect(await svc.saveServices(providerId, serviceIds)).toEqual({ ok: true });
    expect(await svc.saveServices(providerId, ["nope"])).toEqual({ ok: false, error: "servicesRequired" });
    expect(await svc.saveDescription(providerId, "Installation, servicing and repair of split and window AC units.")).toEqual({ ok: true });
    expect(await svc.saveContact(providerId, "255712000111", "biz@example.com")).toEqual({ ok: true });
    expect(await svc.saveWhatsapp(providerId, "255712000111")).toEqual({ ok: true });
    expect(await svc.saveOnline(providerId, "https://juma.example.com/", [{ platform: "INSTAGRAM", url: "https://www.instagram.com/juma" }])).toEqual({ ok: true });
    expect(await svc.saveLocation(providerId, { locationId: mikocheni, addressText: "Plot 12", visibility: "AREA_ONLY" })).toEqual({ ok: true });
    expect(await svc.saveServiceAreas(providerId, [kinondoni, mikocheni])).toEqual({ ok: true });
    expect(await svc.saveServiceAreas(providerId, ["nope"])).toEqual({ ok: false, error: "areaInvalid" });
    expect(
      await svc.saveHours(providerId, { mode: "SCHEDULE", note: null, days: [{ dayOfWeek: 1, opensAt: 480, closesAt: 1080 }] }),
    ).toEqual({ ok: true });
  });

  it("only allows buttons whose data exists", async () => {
    expect(await svc.saveActions(providerId, ["DIRECTIONS"])).toEqual({ ok: false, error: "actionUnavailable" }); // address hidden
    expect(await svc.saveActions(providerId, ["CALL", "WHATSAPP", "WEBSITE"])).toEqual({ ok: true });
  });

  it("keeps prices when the service list changes, and ignores services the provider doesn't offer", async () => {
    await svc.savePricing(providerId, [
      { serviceId: serviceIds[0]!, priceType: "FROM", priceMin: 30000, priceMax: null, priceUnit: "per unit" },
      { serviceId: "someone-elses-service", priceType: "FIXED", priceMin: 1, priceMax: null, priceUnit: null },
    ]);
    await svc.saveServices(providerId, serviceIds.slice(0, 2));
    const rows = await prisma.providerService.findMany({ where: { providerId } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.serviceId === serviceIds[0])).toMatchObject({ priceType: "FROM", priceMin: 30000 });

    // A deliberate "Ask for price" counts as priced; an untouched service does not.
    expect((await svc.completionSnapshot(prisma, providerId)).pricedServiceCount).toBe(1);
    await svc.savePricing(providerId, [{ serviceId: serviceIds[1]!, priceType: "ON_QUOTE", priceMin: null, priceMax: null, priceUnit: null }]);
    expect((await svc.completionSnapshot(prisma, providerId)).pricedServiceCount).toBe(2);
  });

  it("publishes, then refuses edits that would break a live profile", async () => {
    expect(await svc.publishProvider(providerId)).toEqual({ ok: true });
    const live = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    expect(live.status).toBe("ACTIVE");
    expect(live.publishedAt).not.toBeNull();

    expect(await svc.saveDescription(providerId, "short")).toEqual({ ok: false, error: "requiredWhilePublished" });
    expect(await svc.saveActions(providerId, [])).toEqual({ ok: false, error: "requiredWhilePublished" });
    // Rolled back, not half-applied.
    const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { providerId } });
    expect(profile.description).toMatch(/^Installation/);
    expect(profile.enabledActions).toHaveLength(3);
  });

  it("drops a button when the data behind it is removed", async () => {
    expect(await svc.saveOnline(providerId, null, [])).toEqual({ ok: true });
    const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { providerId } });
    expect(profile.enabledActions).toEqual(["CALL", "WHATSAPP"]);
  });

  it("keeps the URL once published, even after hiding and renaming", async () => {
    const before = (await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).slug;
    expect(await svc.unpublishProvider(providerId)).toEqual({ ok: true });
    await svc.saveBusinessName(userId, "Completely New Name");
    expect((await prisma.provider.findUniqueOrThrow({ where: { id: providerId } })).slug).toBe(before);
  });

  it("does not let a suspended provider publish itself", async () => {
    await prisma.provider.update({ where: { id: providerId }, data: { status: "SUSPENDED" } });
    expect(await svc.publishProvider(providerId)).toEqual({ ok: false, error: "notAllowed" });
    expect(await svc.unpublishProvider(providerId)).toEqual({ ok: false, error: "notAllowed" });
    await prisma.provider.update({ where: { id: providerId }, data: { status: "DRAFT" } });
  });

  it("records onboarding progress without going backwards", async () => {
    await svc.recordOnboardingStep(providerId, 5);
    await svc.recordOnboardingStep(providerId, 2);
    expect((await prisma.providerProfile.findUniqueOrThrow({ where: { providerId } })).onboardingStep).toBe(5);
  });
});

describe("images", () => {
  it("re-encodes to WebP, resizes, and strips EXIF including GPS", async () => {
    const out = await processImage(await jpeg(3000, 2000, true), "GALLERY");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
    expect(meta.exif).toBeUndefined();
  });

  it("rejects non-images and oversized files", async () => {
    expect(await processImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "LOGO")).toEqual({ ok: false, error: "imageInvalid" });
    expect(await processImage(Buffer.from("not an image at all"), "LOGO")).toEqual({ ok: false, error: "imageInvalid" });
    expect(await processImage(Buffer.alloc(6 * 1024 * 1024), "LOGO")).toEqual({ ok: false, error: "imageTooLarge" });
  });

  it("uploads to storage, replaces the logo, and serves it publicly", async () => {
    const first = await saveProviderImage(providerId, "LOGO", await jpeg(800, 800));
    expect(first.ok).toBe(true);
    const firstKey = (await prisma.mediaAsset.findFirstOrThrow({ where: { providerId, kind: "LOGO" } })).storageKey;
    const res = await fetch(mediaUrl(firstKey));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");

    await saveProviderImage(providerId, "LOGO", await jpeg(600, 600));
    const logos = await prisma.mediaAsset.findMany({ where: { providerId, kind: "LOGO" } });
    expect(logos).toHaveLength(1);
    expect(logos[0]!.storageKey).not.toBe(firstKey);
    expect((await fetch(mediaUrl(firstKey))).status).not.toBe(200); // old object deleted
  });

  it("caps the gallery", async () => {
    await prisma.mediaAsset.createMany({
      data: Array.from({ length: MAX_GALLERY }, (_, i) => ({
        providerId,
        kind: "GALLERY" as const,
        storageKey: `${run}/fake-${i}.webp`,
        width: 1,
        height: 1,
        bytes: 1,
        sortOrder: i,
      })),
    });
    expect(await saveProviderImage(providerId, "GALLERY", await jpeg(100, 100))).toEqual({ ok: false, error: "galleryFull" });
    await prisma.mediaAsset.deleteMany({ where: { providerId, storageKey: { startsWith: `${run}/fake-` } } });
  });

  it("only deletes images belonging to the given provider", async () => {
    const other = await svc.getOwnedProviderId(otherUserId);
    const logo = await prisma.mediaAsset.findFirstOrThrow({ where: { providerId, kind: "LOGO" } });
    expect(await deleteProviderImage(other!, logo.id)).toBe(false);
    expect(await prisma.mediaAsset.count({ where: { id: logo.id } })).toBe(1);
  });
});
