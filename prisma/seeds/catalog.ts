import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";

/**
 * Starter catalogue (categories, services) and Dar es Salaam areas.
 *
 * Insert-only: an existing row (matched by slug) is left exactly as an admin last edited it, so
 * re-running never undoes admin changes. Contains no providers, prices or reviews — those only
 * ever come from real providers and customers.
 *
 * Locations: Dar es Salaam's five districts and widely used neighbourhood names under them, typed
 * NEIGHBOURHOOD (not WARD) because they are the names people search by, not an official ward list.
 * Verify the district of each against the NBS administrative list before launch. Coordinates are
 * left null until the location engine (Phase 4) fills them from a real source.
 */

type ServiceSeed = [slug: string, nameEn: string, nameSw: string, keywords?: string[]];
type CategorySeed = {
  slug: string;
  nameEn: string;
  nameSw: string;
  icon: string;
  services?: ServiceSeed[];
  children?: Omit<CategorySeed, "children">[];
};

const CATEGORIES: CategorySeed[] = [
  {
    slug: "home-repairs",
    nameEn: "Home Repairs & Maintenance",
    nameSw: "Matengenezo ya Nyumbani",
    icon: "wrench",
    children: [
      {
        slug: "plumbing",
        nameEn: "Plumbing",
        nameSw: "Mabomba",
        icon: "droplets",
        services: [
          ["pipe-leak-repair", "Pipe & leak repair", "Kurekebisha mabomba yanayovuja", ["fundi bomba", "plumber", "leak"]],
          ["water-tank-services", "Water tank installation & cleaning", "Kufunga na kusafisha matanki ya maji", ["tank", "simtank"]],
          ["drain-unblocking", "Drain & toilet unblocking", "Kuzibua mifereji na vyoo", ["blocked drain", "choo kimeziba"]],
        ],
      },
      {
        slug: "electrical",
        nameEn: "Electrical",
        nameSw: "Umeme",
        icon: "zap",
        services: [
          ["house-wiring", "House wiring", "Kuweka nyaya za umeme", ["fundi umeme", "electrician", "wiring"]],
          ["electrical-fault-repair", "Electrical fault repair", "Kurekebisha hitilafu za umeme", ["fundi umeme", "electrician", "short circuit"]],
          ["solar-installation", "Solar installation", "Kufunga umeme wa jua (solar)", ["solar", "sola"]],
        ],
      },
      {
        slug: "ac-refrigeration",
        nameEn: "AC & Refrigeration",
        nameSw: "AC na Friji",
        icon: "snowflake",
        services: [
          ["ac-repair", "AC repair & servicing", "Kutengeneza na kuhudumia AC", ["fundi AC", "air conditioner", "aircon", "kiyoyozi"]],
          ["ac-installation", "AC installation", "Kufunga AC", ["air conditioner", "kiyoyozi"]],
          ["fridge-repair", "Fridge & freezer repair", "Kutengeneza friji na freezer", ["fundi friji", "refrigerator"]],
        ],
      },
      {
        slug: "carpentry",
        nameEn: "Carpentry",
        nameSw: "Useremala",
        icon: "hammer",
        services: [
          ["furniture-making-repair", "Furniture making & repair", "Kutengeneza na kukarabati samani", ["fundi seremala", "carpenter", "fanicha"]],
          ["doors-windows", "Doors & windows", "Milango na madirisha", ["carpenter", "mlango"]],
        ],
      },
      {
        slug: "painting",
        nameEn: "Painting",
        nameSw: "Upakaji Rangi",
        icon: "paint-roller",
        services: [["house-painting", "House painting", "Kupaka rangi nyumba", ["fundi rangi", "painter"]]],
      },
    ],
  },
  {
    slug: "construction",
    nameEn: "Building & Construction",
    nameSw: "Ujenzi",
    icon: "hard-hat",
    services: [
      ["masonry", "Masonry", "Fundi mwashi", ["fundi ujenzi", "mason", "block work"]],
      ["tiling", "Tiling", "Kuweka vigae (tiles)", ["tiles", "fundi tiles"]],
      ["welding-metalwork", "Welding & metalwork", "Uchomeleaji na kazi za chuma", ["welder", "fundi chuma", "grill"]],
      ["roofing", "Roofing", "Kuezeka paa", ["bati", "roof"]],
      ["gypsum-ceilings", "Gypsum & ceilings", "Gypsum na dari", ["gypsum", "ceiling", "siling"]],
    ],
  },
  {
    slug: "cleaning",
    nameEn: "Cleaning",
    nameSw: "Usafi",
    icon: "sparkles",
    services: [
      ["house-cleaning", "House cleaning", "Usafi wa nyumba", ["cleaner", "msafishaji"]],
      ["office-cleaning", "Office cleaning", "Usafi wa ofisi", ["cleaner", "commercial cleaning"]],
      ["sofa-carpet-cleaning", "Sofa & carpet cleaning", "Kusafisha sofa na zulia", ["carpet", "zulia", "sofa"]],
      ["laundry", "Laundry & dry cleaning", "Kufua na kunyoosha nguo", ["dobi", "laundry", "dry cleaner"]],
      ["pest-control", "Pest control & fumigation", "Kuua wadudu (fumigation)", ["fumigation", "mende", "wadudu"]],
    ],
  },
  {
    slug: "beauty",
    nameEn: "Beauty & Personal Care",
    nameSw: "Urembo na Mwonekano",
    icon: "scissors",
    services: [
      ["hair-salon", "Hair salon", "Saluni ya nywele", ["saluni", "salon", "kusuka", "braids"]],
      ["barber", "Barber", "Kinyozi", ["kinyozi", "barbershop", "kunyoa"]],
      ["makeup", "Makeup", "Urembo wa uso (makeup)", ["makeup artist", "bridal makeup"]],
      ["nails", "Nails", "Kucha", ["manicure", "pedicure", "kucha"]],
      ["massage", "Massage", "Masaji", ["spa", "masaji"]],
    ],
  },
  {
    slug: "vehicles",
    nameEn: "Vehicles",
    nameSw: "Magari",
    icon: "car",
    services: [
      ["car-repair", "Car repair (mechanic)", "Fundi magari", ["mechanic", "gereji", "garage", "fundi gari"]],
      ["auto-electrician", "Auto electrician", "Fundi umeme wa magari", ["auto electric", "betri"]],
      ["car-wash", "Car wash", "Kuosha magari", ["car wash", "kuosha gari"]],
      ["tyres-alignment", "Tyres & wheel alignment", "Matairi na alignment", ["tyre", "tairi", "puncture", "pancha"]],
      ["towing", "Towing", "Kuvuta magari (breakdown)", ["breakdown", "tow truck"]],
    ],
  },
  {
    slug: "electronics",
    nameEn: "Electronics & Phones",
    nameSw: "Elektroniki na Simu",
    icon: "smartphone",
    services: [
      ["phone-repair", "Phone repair", "Kutengeneza simu", ["fundi simu", "screen", "kioo"]],
      ["computer-repair", "Computer & laptop repair", "Kutengeneza kompyuta na laptop", ["laptop", "fundi kompyuta"]],
      ["tv-sound-repair", "TV & sound system repair", "Kutengeneza TV na redio", ["fundi TV", "music system"]],
      ["cctv-installation", "CCTV & security systems", "Kufunga CCTV na mifumo ya ulinzi", ["cctv", "camera"]],
    ],
  },
  {
    slug: "moving-transport",
    nameEn: "Moving & Transport",
    nameSw: "Usafiri na Kuhamisha",
    icon: "truck",
    services: [
      ["house-office-moving", "House & office moving", "Kuhamisha mizigo ya nyumba na ofisi", ["movers", "kuhama", "kirikuu"]],
      ["parcel-delivery", "Parcel delivery", "Usafirishaji wa vifurushi", ["delivery", "boda", "mzigo"]],
    ],
  },
  {
    slug: "events",
    nameEn: "Events",
    nameSw: "Sherehe na Matukio",
    icon: "party-popper",
    services: [
      ["catering", "Catering", "Upishi wa sherehe", ["chakula", "caterer"]],
      ["event-decoration", "Event decoration", "Mapambo ya sherehe", ["decor", "mapambo", "harusi"]],
      ["photography-video", "Photography & video", "Upigaji picha na video", ["photographer", "mpiga picha", "video"]],
      ["mc-dj", "MC & DJ", "MC na DJ", ["mshereheshaji", "dj", "mc"]],
      ["tents-chairs-hire", "Tents & chairs hire", "Kukodisha mahema na viti", ["hema", "tent", "viti"]],
    ],
  },
  {
    slug: "lessons",
    nameEn: "Tutoring & Lessons",
    nameSw: "Masomo na Mafunzo",
    icon: "graduation-cap",
    services: [
      ["home-tuition", "Home tuition", "Masomo ya ziada nyumbani (tuition)", ["tuition", "mwalimu", "tutor"]],
      ["language-lessons", "Language lessons", "Masomo ya lugha", ["english", "kiswahili", "french"]],
      ["driving-lessons", "Driving lessons", "Mafunzo ya udereva", ["driving school", "udereva"]],
    ],
  },
  {
    slug: "home-help",
    nameEn: "Home Help",
    nameSw: "Wasaidizi wa Nyumbani",
    icon: "house",
    services: [
      ["housekeeper", "Housekeeper", "Msaidizi wa kazi za ndani", ["house girl", "dada wa kazi", "house help"]],
      ["nanny", "Nanny & babysitting", "Mlezi wa watoto", ["babysitter", "yaya"]],
      ["security-guard", "Security guard", "Mlinzi", ["guard", "askari", "ulinzi"]],
      ["gardening", "Gardening & landscaping", "Utunzaji wa bustani", ["gardener", "bustani", "landscaping"]],
    ],
  },
  {
    slug: "business-services",
    nameEn: "Business Services",
    nameSw: "Huduma za Biashara",
    icon: "briefcase",
    services: [
      ["printing-branding", "Printing & branding", "Uchapishaji na chapa", ["printing", "t-shirt", "banner"]],
      ["website-it-support", "Websites & IT support", "Tovuti na huduma za TEHAMA", ["website", "IT", "tovuti"]],
      ["bookkeeping-tax", "Bookkeeping & tax", "Uhasibu na kodi", ["accountant", "mhasibu", "TRA"]],
    ],
  },
];

const DISTRICTS: { slug: string; name: string; areas: string[] }[] = [
  {
    slug: "kinondoni-district",
    name: "Kinondoni",
    areas: ["Bunju", "Kawe", "Kijitonyama", "Kinondoni", "Magomeni", "Masaki", "Mbezi Beach", "Mikocheni", "Msasani", "Mwananyamala", "Mwenge", "Oysterbay", "Tegeta"],
  },
  {
    slug: "ilala-district",
    name: "Ilala",
    areas: ["Buguruni", "City Centre (Posta)", "Gongo la Mboto", "Ilala", "Kariakoo", "Kinyerezi", "Kiwalani", "Segerea", "Tabata", "Ukonga", "Upanga", "Vingunguti"],
  },
  {
    slug: "ubungo-district",
    name: "Ubungo",
    areas: ["Goba", "Kibamba", "Kimara", "Mabibo", "Makuburi", "Manzese", "Mbezi", "Sinza", "Ubungo"],
  },
  {
    slug: "temeke-district",
    name: "Temeke",
    areas: ["Chang'ombe", "Keko", "Kijichi", "Kurasini", "Mbagala", "Mtoni", "Tandika", "Temeke"],
  },
  {
    slug: "kigamboni-district",
    name: "Kigamboni",
    areas: ["Kibada", "Kigamboni", "Mjimwema", "Somangila", "Tungi"],
  },
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

let created = 0;

async function upsertCategory(c: Omit<CategorySeed, "children">, parentId: string | null, sortOrder: number) {
  const before = await prisma.category.findUnique({ where: { slug: c.slug }, select: { id: true } });
  const row =
    before ??
    (await prisma.category.create({
      data: { slug: c.slug, nameEn: c.nameEn, nameSw: c.nameSw, icon: c.icon, parentId, sortOrder },
      select: { id: true },
    }));
  if (!before) created++;

  for (const [i, [slug, nameEn, nameSw, keywords]] of (c.services ?? []).entries()) {
    const exists = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (exists) continue;
    await prisma.service.create({
      data: { slug, nameEn, nameSw, keywords: keywords ?? [], categoryId: row.id, sortOrder: i },
    });
    created++;
  }
  return row.id;
}

async function upsertLocation(data: { slug: string; name: string; type: "COUNTRY" | "REGION" | "DISTRICT" | "NEIGHBOURHOOD"; parentId: string | null; sortOrder: number }) {
  const before = await prisma.location.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (before) return before.id;
  created++;
  return (await prisma.location.create({ data, select: { id: true } })).id;
}

async function main() {
  for (const [i, cat] of CATEGORIES.entries()) {
    const id = await upsertCategory(cat, null, i);
    for (const [j, child] of (cat.children ?? []).entries()) await upsertCategory(child, id, j);
  }

  const tz = await upsertLocation({ slug: "tanzania", name: "Tanzania", type: "COUNTRY", parentId: null, sortOrder: 0 });
  const dar = await upsertLocation({ slug: "dar-es-salaam", name: "Dar es Salaam", type: "REGION", parentId: tz, sortOrder: 0 });
  for (const [i, d] of DISTRICTS.entries()) {
    const districtId = await upsertLocation({ slug: d.slug, name: d.name, type: "DISTRICT", parentId: dar, sortOrder: i });
    for (const [j, area] of d.areas.entries()) {
      await upsertLocation({ slug: slugify(area), name: area, type: "NEIGHBOURHOOD", parentId: districtId, sortOrder: j });
    }
  }

  // Area centres from OpenStreetMap (see data file for source and licence). Only fills
  // coordinates that are still empty, so an admin's correction is never overwritten.
  const coords = JSON.parse(readFileSync(join(__dirname, "data", "dar-area-coordinates.json"), "utf8")) as {
    areas: { area: string; district: string; lat: number | null; lng: number | null }[];
  };
  let located = 0;
  for (const d of DISTRICTS) {
    const points = coords.areas.filter((a) => a.district === d.name && a.lat != null && a.lng != null);
    for (const p of points) {
      const r = await prisma.location.updateMany({
        where: { slug: slugify(p.area), latitude: null },
        data: { latitude: p.lat!, longitude: p.lng! },
      });
      located += r.count;
    }
    // District centre = mean of its located areas.
    if (points.length) {
      const lat = points.reduce((s, p) => s + p.lat!, 0) / points.length;
      const lng = points.reduce((s, p) => s + p.lng!, 0) / points.length;
      const r = await prisma.location.updateMany({
        where: { slug: d.slug, latitude: null },
        data: { latitude: Number(lat.toFixed(5)), longitude: Number(lng.toFixed(5)) },
      });
      located += r.count;
    }
  }

  // Default verification tiers (platform configuration; super admins can edit or add tiers).
  const levels = [
    {
      slug: "identity",
      nameEn: "Identity verified",
      nameSw: "Utambulisho umethibitishwa",
      descriptionEn: "GO BIG checked a government ID (NIDA card or passport) of the person behind this profile.",
      descriptionSw: "GO BIG imekagua kitambulisho cha serikali (NIDA au pasipoti) cha mtu aliye nyuma ya wasifu huu.",
      rank: 1,
      requiredDocuments: [] as ("NATIONAL_ID" | "BUSINESS_LICENSE" | "TIN_CERTIFICATE")[],
    },
    {
      slug: "business",
      nameEn: "Business verified",
      nameSw: "Biashara imethibitishwa",
      descriptionEn: "GO BIG checked this business's licence and TIN certificate.",
      descriptionSw: "GO BIG imekagua leseni ya biashara na cheti cha TIN cha biashara hii.",
      rank: 2,
      requiredDocuments: ["BUSINESS_LICENSE", "TIN_CERTIFICATE"] as ("NATIONAL_ID" | "BUSINESS_LICENSE" | "TIN_CERTIFICATE")[],
    },
  ];
  let levelsCreated = 0;
  for (const level of levels) {
    const exists = await prisma.verificationLevel.findUnique({ where: { slug: level.slug }, select: { id: true } });
    if (exists) continue;
    await prisma.verificationLevel.create({ data: level });
    levelsCreated++;
  }

  console.log(
    `Catalogue seed done: ${created} new rows, ${located} locations given coordinates, ${levelsCreated} verification levels (existing values untouched).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
