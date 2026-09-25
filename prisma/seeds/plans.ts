import "dotenv/config";
import { prisma } from "@/lib/db";

/**
 * Creates the four plans (Phase 11) if they don't exist. Paid plans start with NO price: an admin
 * sets prices in Admin → Monetization, and a plan can't be requested until it has one. Existing
 * plans are never overwritten (an admin may have edited them).
 */
const PLANS = [
  {
    code: "FREE" as const,
    nameEn: "Free",
    nameSw: "Bure",
    descriptionEn: "A full business profile, search listing, service requests and reviews.",
    descriptionSw: "Wasifu kamili wa biashara, kuonekana kwenye utafutaji, maombi ya huduma na maoni.",
    priceTzs: 0,
    galleryLimit: 12,
    priorityVerificationReview: false,
    allowsCampaigns: false,
    sortOrder: 0,
  },
  {
    code: "PRO" as const,
    nameEn: "Pro",
    nameSw: "Pro",
    descriptionEn: "Up to 30 gallery photos and the option to buy featured campaigns.",
    descriptionSw: "Hadi picha 30 kwenye matunzio na uwezo wa kununua kampeni za kuangaziwa.",
    priceTzs: null,
    galleryLimit: 30,
    priorityVerificationReview: false,
    allowsCampaigns: true,
    sortOrder: 1,
  },
  {
    code: "PROFESSIONAL" as const,
    nameEn: "Professional",
    nameSw: "Kitaaluma",
    descriptionEn: "Everything in Pro, and your verification application is reviewed first. (The decision is the same as for everyone.)",
    descriptionSw: "Kila kitu cha Pro, na ombi lako la uthibitisho linakaguliwa kwanza. (Uamuzi ni sawa na kwa kila mtu.)",
    priceTzs: null,
    galleryLimit: 30,
    priorityVerificationReview: true,
    allowsCampaigns: true,
    sortOrder: 2,
  },
  {
    code: "FEATURED" as const,
    nameEn: "Featured",
    nameSw: "Kuangaziwa",
    descriptionEn: "Everything in Professional, plus a Sponsored spot above search results for your services while the plan is active. Always labelled as Sponsored.",
    descriptionSw: "Kila kitu cha Kitaaluma, pamoja na nafasi ya Tangazo juu ya matokeo ya utafutaji kwa huduma zako mpango ukiwa hai. Daima ina alama ya Tangazo.",
    priceTzs: null,
    galleryLimit: 30,
    priorityVerificationReview: true,
    allowsCampaigns: true,
    sortOrder: 3,
  },
];

async function main() {
  for (const p of PLANS) {
    const existing = await prisma.plan.findUnique({ where: { code: p.code }, select: { id: true } });
    if (existing) {
      console.log(`${p.code}: exists — unchanged`);
      continue;
    }
    await prisma.plan.create({ data: p });
    console.log(`${p.code}: created${p.priceTzs == null ? " (no price yet — set it in Admin → Monetization)" : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
