// Sample businesses for the TEST deployment (owner's request, 2026-09-26: "I want the app to be full
// for testing"). Every one is flagged `isDemo`: it shows a "Sample" label, its Call/WhatsApp buttons
// dial no one (the numbers below are invented and could belong to real people), and
//
//   npm run db:demo:seed     # add them (skips ones that already exist)
//   npm run db:demo:photos   # use real photos from prisma/seeds/demo-photos/<business-slug>.jpg|png|webp
//   npm run db:demo:remove   # delete every sample business, its photos, reviews and accounts
//
// Remove them before real launch. Accounts use the unroutable @demo.nexa.local domain and a password
// hash nothing can match, so nobody can sign in as them.
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import * as profile from "@/lib/services/providerProfile";
import { saveProviderImage } from "@/lib/services/media";
import { upsertReview } from "@/lib/services/reviews";
import { deleteObject } from "@/lib/storage";

const DOMAIN = "@demo.nexa.local";
type Price = { type: "FIXED" | "FROM" | "ON_QUOTE"; amount?: number; unit?: string };
type Spec = {
  name: string;
  services: string[];
  area: string;
  price: Price;
  hours: "weekdays" | "always" | "appointment";
  verified?: 1 | 2;
  about: string;
  tint: string;
};

const SPECS: Spec[] = [
  { name: "Baridi Cool AC", services: ["ac-repair", "ac-installation"], area: "mikocheni", price: { type: "FROM", amount: 30000 }, hours: "weekdays", verified: 2, tint: "#2563eb", about: "Tunatengeneza, kufunga na kuhudumia AC za nyumbani na ofisini. AC repair, installation and servicing for homes and offices." },
  { name: "Fundi Bomba Sinza", services: ["pipe-leak-repair", "water-tank-services"], area: "sinza", price: { type: "FROM", amount: 20000 }, hours: "always", verified: 1, tint: "#0284c7", about: "Mabomba yanayovuja, matanki ya maji na vyoo vilivyoziba. Fast plumbing help around Sinza and Ubungo." },
  { name: "Umeme Safi Electric", services: ["electrical-fault-repair", "house-wiring"], area: "kariakoo", price: { type: "FROM", amount: 25000 }, hours: "weekdays", tint: "#d97706", about: "Ufundi wa umeme: hitilafu, wiring ya nyumba na ofisi. Electrical fault finding and house wiring." },
  { name: "Nyumba Safi Cleaners", services: ["house-cleaning", "office-cleaning"], area: "masaki", price: { type: "FIXED", amount: 40000, unit: "per visit" }, hours: "weekdays", verified: 2, tint: "#16a34a", about: "Usafi wa nyumba na ofisi kwa timu yenye uzoefu. Home and office cleaning with our own supplies." },
  { name: "Mama Neema Salon", services: ["hair-salon"], area: "kinondoni", price: { type: "FROM", amount: 15000 }, hours: "weekdays", tint: "#db2777", about: "Kusuka, kuosha na kutengeneza nywele. Braids, washing and styling in Kinondoni." },
  { name: "Kinyozi Classic", services: ["barber"], area: "mwenge", price: { type: "FIXED", amount: 5000 }, hours: "always", verified: 1, tint: "#475569", about: "Kunyoa kwa kisasa na kwa haraka. Modern cuts, beard trims and kids' haircuts." },
  { name: "Gari Poa Garage", services: ["car-repair", "auto-electrician"], area: "ubungo", price: { type: "ON_QUOTE" }, hours: "weekdays", verified: 2, tint: "#1e3a5f", about: "Matengenezo ya magari: injini, breki na umeme wa gari. Car repairs and auto electrics." },
  { name: "Rangi Bora Painters", services: ["house-painting"], area: "kimara", price: { type: "FROM", amount: 150000 }, hours: "appointment", tint: "#7c3aed", about: "Kupaka rangi nyumba ndani na nje. Interior and exterior painting, neat and on time." },
  { name: "Tiles Masters Dar", services: ["tiling", "masonry"], area: "mbezi", price: { type: "ON_QUOTE" }, hours: "weekdays", tint: "#a16207", about: "Kuweka tiles, ujenzi mdogo na ukarabati. Tiling, masonry and small renovations." },
  { name: "Fundi Mbao Furniture", services: ["furniture-making-repair", "doors-windows"], area: "temeke", price: { type: "ON_QUOTE" }, hours: "weekdays", tint: "#92400e", about: "Samani za mbao, milango na madirisha. Custom furniture, doors and windows." },
  { name: "Simu Fix Kariakoo", services: ["phone-repair", "computer-repair"], area: "kariakoo", price: { type: "FROM", amount: 10000 }, hours: "weekdays", verified: 1, tint: "#0891b2", about: "Kutengeneza simu na kompyuta: skrini, betri na software. Phone and laptop repairs." },
  { name: "Hamisha Haraka Movers", services: ["house-office-moving", "parcel-delivery"], area: "tabata", price: { type: "FROM", amount: 120000 }, hours: "always", tint: "#ea580c", about: "Kuhamisha nyumba na ofisi pamoja na usafirishaji wa mizigo. House and office moves across Dar." },
  { name: "Sherehe Bora Events", services: ["catering", "event-decoration"], area: "oysterbay", price: { type: "ON_QUOTE" }, hours: "appointment", verified: 2, tint: "#be123c", about: "Chakula na mapambo ya sherehe: harusi, kitchen party na mikutano. Catering and decoration." },
  { name: "Mwalimu Nyumbani", services: ["home-tuition", "language-lessons"], area: "upanga", price: { type: "FROM", amount: 20000, unit: "per lesson" }, hours: "appointment", tint: "#4f46e5", about: "Masomo ya ziada nyumbani: hesabu, sayansi na Kiingereza. Home tuition and language lessons." },
  { name: "Msaidizi Home Help", services: ["housekeeper", "nanny"], area: "msasani", price: { type: "ON_QUOTE" }, hours: "weekdays", tint: "#059669", about: "Tunaunganisha familia na wasaidizi wa nyumbani wenye uzoefu. Housekeepers and nannies." },
  { name: "Chapa Print & IT", services: ["printing-branding", "website-it-support"], area: "city-centre", price: { type: "FROM", amount: 50000 }, hours: "weekdays", tint: "#0f766e", about: "Uchapishaji, branding na huduma za tovuti na IT. Printing, branding and IT support." },
  { name: "Baridi Air Solutions", services: ["ac-repair"], area: "msasani", price: { type: "FROM", amount: 35000 }, hours: "weekdays", tint: "#1d4ed8", about: "Huduma za AC kwa haraka Msasani, Masaki na Oysterbay. Quick AC service on the peninsula." },
  { name: "Maji Safi Plumbing", services: ["pipe-leak-repair"], area: "kijitonyama", price: { type: "FIXED", amount: 25000, unit: "per visit" }, hours: "weekdays", tint: "#0369a1", about: "Fundi bomba wa kuaminika Kijitonyama na Mwenge. Reliable plumbing, fair prices." },
];

const CUSTOMERS = ["Neema Kweka", "Juma Hassan", "Asha Mushi", "Baraka Mollel", "Rehema Salum", "Daudi Mrema"];
const REVIEWS = [
  { rating: 5, body: "Alifika kwa wakati na kazi ilikuwa safi sana. Nitampigia tena." },
  { rating: 5, body: "Great service, explained everything clearly and the price was fair." },
  { rating: 4, body: "Kazi nzuri, alichelewa kidogo lakini matokeo ni mazuri." },
  { rating: 5, body: "Very professional and polite. Highly recommended in Dar." },
  { rating: 4, body: "Good work overall, will use again." },
  { rating: 3, body: "Kazi imefanyika ila bei ilikuwa juu kidogo kuliko nilivyotarajia." },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const initials = (s: string) => s.split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Branded placeholder images (logo and work photos): gradient, initials, service name. */
async function image(kind: "logo" | "work", spec: Spec, label: string, n = 0): Promise<Buffer> {
  const [w, h] = kind === "logo" ? [600, 600] : [1200, 900];
  const angle = [135, 160, 110, 200][n % 4];
  const svg =
    kind === "logo"
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" rx="0" fill="${spec.tint}"/><circle cx="300" cy="300" r="210" fill="#ffffff" opacity="0.15"/><text x="50%" y="54%" font-family="Arial, Helvetica, sans-serif" font-size="210" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${esc(initials(spec.name))}</text></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${spec.tint}"/><stop offset="1" stop-color="#0b1b33"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.8}" cy="${h * 0.25}" r="${h * 0.35}" fill="#ffffff" opacity="0.07"/><circle cx="${w * 0.15}" cy="${h * 0.9}" r="${h * 0.4}" fill="#ffffff" opacity="0.05"/><text x="60" y="${h - 90}" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" fill="#ffffff" opacity="0.92">${esc(label)}</text><text x="60" y="${h - 40}" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#ffffff" opacity="0.6">NEXA sample</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

async function seed() {
  const services = await prisma.service.findMany({ select: { id: true, slug: true, categoryId: true, nameEn: true } });
  const svc = new Map(services.map((s) => [s.slug, s]));
  const levels = await prisma.verificationLevel.findMany({ where: { isActive: true }, orderBy: { rank: "asc" }, select: { id: true, rank: true } });

  const customers = [];
  for (const name of CUSTOMERS) {
    const email = `${slugify(name)}${DOMAIN}`;
    customers.push(
      (await prisma.user.findUnique({ where: { email } })) ??
        (await prisma.user.create({ data: { name, email, passwordHash: "!demo-no-login", role: "CUSTOMER" } })),
    );
  }

  let made = 0;
  for (const [i, spec] of SPECS.entries()) {
    const email = `owner-${slugify(spec.name)}${DOMAIN}`;
    if (await prisma.user.findUnique({ where: { email } })) continue; // already seeded
    const chosen = spec.services.map((s) => svc.get(s)).filter((s): s is NonNullable<typeof s> => !!s);
    const loc = await prisma.location.findUnique({ where: { slug: spec.area } });
    if (!chosen.length || !loc) {
      console.log("skipped", spec.name, "(service or area not in the catalogue)");
      continue;
    }
    const owner = await prisma.user.create({ data: { name: `Owner of ${spec.name}`, email, passwordHash: "!demo-no-login", role: "PROVIDER" } });
    const { providerId } = await profile.saveBusinessName(owner.id, spec.name);
    await profile.saveCategory(providerId, chosen[0]!.categoryId);
    await profile.saveServices(providerId, chosen.map((s) => s.id));
    await profile.savePricing(
      providerId,
      chosen.map((s, k) => {
        const p: Price = k === 0 ? spec.price : { type: "ON_QUOTE" };
        return { serviceId: s.id, priceType: p.type, priceMin: p.amount ?? null, priceMax: null, priceUnit: p.unit ?? null };
      }),
    );
    await profile.saveDescription(providerId, spec.about);
    // Invented numbers — the "Sample" flag stops the buttons from dialling them.
    const phone = `2557${String(10_000_000 + i * 7919).padStart(8, "0")}`;
    await profile.saveContact(providerId, phone, null);
    await profile.saveWhatsapp(providerId, phone);
    await profile.saveLocation(providerId, { locationId: loc.id, addressText: null, visibility: "AREA_ONLY" });
    if (spec.hours === "always") await profile.saveHours(providerId, { mode: "ALWAYS_OPEN", days: [], note: null });
    else if (spec.hours === "appointment") await profile.saveHours(providerId, { mode: "BY_APPOINTMENT", days: [], note: null });
    else await profile.saveHours(providerId, { mode: "SCHEDULE", note: null, days: [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: 480, closesAt: d === 6 ? 840 : 1080 })) });
    await profile.saveActions(providerId, ["CALL", "WHATSAPP", "REQUEST_QUOTE"]);

    const label = chosen[0]!.nameEn;
    await saveProviderImage(providerId, "LOGO", await image("logo", spec, label));
    for (let n = 1; n <= 3; n++) await saveProviderImage(providerId, "GALLERY", await image("work", spec, label, n));

    const pub = await profile.publishProvider(providerId);
    if (!pub.ok) {
      console.log("could not publish", spec.name, JSON.stringify(pub));
      continue;
    }
    const level = spec.verified ? levels.find((l) => l.rank === spec.verified) ?? levels[0] : undefined;
    await prisma.provider.update({
      where: { id: providerId },
      data: { isDemo: true, ...(level ? { verificationLevelId: level.id, verifiedAt: new Date() } : {}) },
    });

    // A few sample reviews (0–6), always labelled with the business as a sample.
    const count = (i * 5 + 3) % 7;
    for (let r = 0; r < count && r < customers.length; r++) {
      const c = customers[(i + r) % customers.length]!;
      await upsertReview({ id: c.id, role: "CUSTOMER", status: "ACTIVE" }, providerId, REVIEWS[(i + r) % REVIEWS.length]!);
    }
    made++;
    console.log("added", spec.name);
  }
  console.log(`done: ${made} sample businesses added`);
}

const PHOTO_DIR = path.join(process.cwd(), "prisma/seeds/demo-photos");

/** A photo the owner supplied for this sample business, if any (the folder is gitignored). */
function photoFor(spec: Spec): Buffer | null {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const file = path.join(PHOTO_DIR, `${slugify(spec.name)}.${ext}`);
    if (existsSync(file)) return readFileSync(file);
  }
  return null;
}

/**
 * Makes each supplied photo the business's cover. Without one a sample has no cover (the card shows
 * its logo), so it ranks after businesses with a real photo.
 */
async function photos() {
  let used = 0;
  for (const spec of SPECS) {
    const photo = photoFor(spec);
    if (!photo) {
      const covers = await prisma.mediaAsset.findMany({ where: { kind: "COVER", provider: { isDemo: true, members: { some: { role: "OWNER", user: { email: `owner-${slugify(spec.name)}${DOMAIN}` } } } } } });
      for (const c of covers) {
        await prisma.mediaAsset.delete({ where: { id: c.id } });
        await deleteObject(c.storageKey).catch(() => undefined);
      }
      continue;
    }
    const provider = await prisma.provider.findFirst({ where: { isDemo: true, members: { some: { role: "OWNER", user: { email: `owner-${slugify(spec.name)}${DOMAIN}` } } } }, select: { id: true } });
    if (!provider) {
      console.log("no sample business yet for", spec.name, "- run db:demo:seed first");
      continue;
    }
    const res = await saveProviderImage(provider.id, "COVER", photo);
    console.log(res.ok ? `cover set: ${spec.name}` : `rejected ${spec.name}: ${res.error}`);
    if (res.ok) used++;
  }
  console.log(`done: ${used} photos used (folder: prisma/seeds/demo-photos, names = ${SPECS.slice(0, 2).map((s) => slugify(s.name)).join(", ")}, ...)`);
}

async function remove() {
  const providers = await prisma.provider.findMany({ where: { isDemo: true }, select: { id: true, media: { select: { storageKey: true } } } });
  for (const p of providers) for (const m of p.media) await deleteObject(m.storageKey).catch(() => undefined);
  const deleted = await prisma.provider.deleteMany({ where: { isDemo: true } });
  const users = await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  console.log(`removed ${deleted.count} sample businesses and ${users.count} sample accounts`);
}

const mode = process.argv[2];
(mode === "remove" ? remove() : mode === "photos" ? photos() : seed().then(photos))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
