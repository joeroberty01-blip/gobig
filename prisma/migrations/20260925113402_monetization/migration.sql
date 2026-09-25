-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('FREE', 'PRO', 'PROFESSIONAL', 'FEATURED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('FEATURED_SEARCH', 'SPONSORED_CATEGORY');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('REQUESTED', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MPESA', 'TIGO_PESA', 'AIRTEL_MONEY', 'HALOPESA', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('RECORDED', 'VOIDED');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameSw" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionSw" TEXT NOT NULL,
    "priceTzs" INTEGER,
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "galleryLimit" INTEGER NOT NULL DEFAULT 12,
    "leadsPerMonth" INTEGER,
    "priorityVerificationReview" BOOLEAN NOT NULL DEFAULT false,
    "allowsCampaigns" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "priceTzs" INTEGER NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "requestedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturedCampaign" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "CampaignKind" NOT NULL,
    "serviceId" TEXT,
    "categoryId" TEXT,
    "locationId" TEXT,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'REQUESTED',
    "priceTzs" INTEGER,
    "note" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeaturedCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "campaignId" TEXT,
    "amountTzs" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetizationSettings" (
    "id" TEXT NOT NULL,
    "paidLeadsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "featuredSlots" INTEGER NOT NULL DEFAULT 2,
    "paymentInstructionsEn" TEXT,
    "paymentInstructionsSw" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonetizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Subscription_providerId_status_idx" ON "Subscription"("providerId", "status");

-- CreateIndex
CREATE INDEX "FeaturedCampaign_status_kind_startsAt_endsAt_idx" ON "FeaturedCampaign"("status", "kind", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "FeaturedCampaign_providerId_idx" ON "FeaturedCampaign"("providerId");

-- CreateIndex
CREATE INDEX "Payment_providerId_paidAt_idx" ON "Payment"("providerId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_method_reference_key" ON "Payment"("method", "reference");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedCampaign" ADD CONSTRAINT "FeaturedCampaign_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedCampaign" ADD CONSTRAINT "FeaturedCampaign_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedCampaign" ADD CONSTRAINT "FeaturedCampaign_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedCampaign" ADD CONSTRAINT "FeaturedCampaign_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FeaturedCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules Prisma cannot express.
ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_price_non_negative" CHECK ("priceTzs" IS NULL OR "priceTzs" >= 0),
  ADD CONSTRAINT "Plan_period_range" CHECK ("periodDays" BETWEEN 1 AND 366),
  ADD CONSTRAINT "Plan_gallery_range" CHECK ("galleryLimit" BETWEEN 1 AND 60),
  ADD CONSTRAINT "Plan_leads_non_negative" CHECK ("leadsPerMonth" IS NULL OR "leadsPerMonth" >= 0);
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_price_non_negative" CHECK ("priceTzs" >= 0),
  ADD CONSTRAINT "Subscription_period_order" CHECK ("currentPeriodEnd" IS NULL OR "currentPeriodStart" IS NULL OR "currentPeriodEnd" > "currentPeriodStart"),
  ADD CONSTRAINT "Subscription_active_has_period" CHECK ("status" <> 'ACTIVE' OR ("currentPeriodStart" IS NOT NULL AND "currentPeriodEnd" IS NOT NULL));
-- At most one open (pending, active or past-due) subscription per provider.
CREATE UNIQUE INDEX "Subscription_one_open" ON "Subscription" ("providerId") WHERE "status" IN ('PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE');
ALTER TABLE "FeaturedCampaign"
  ADD CONSTRAINT "FeaturedCampaign_dates" CHECK ("endsAt" >= "startsAt"),
  ADD CONSTRAINT "FeaturedCampaign_price_non_negative" CHECK ("priceTzs" IS NULL OR "priceTzs" >= 0),
  ADD CONSTRAINT "FeaturedCampaign_sponsored_needs_category" CHECK ("kind" <> 'SPONSORED_CATEGORY' OR "categoryId" IS NOT NULL);
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountTzs" > 0),
  ADD CONSTRAINT "Payment_reference_length" CHECK (char_length("reference") BETWEEN 3 AND 60),
  ADD CONSTRAINT "Payment_target" CHECK ("subscriptionId" IS NOT NULL OR "campaignId" IS NOT NULL);
ALTER TABLE "MonetizationSettings"
  ADD CONSTRAINT "MonetizationSettings_slots" CHECK ("featuredSlots" BETWEEN 0 AND 5);
