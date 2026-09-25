-- CreateEnum
CREATE TYPE "OpeningHoursMode" AS ENUM ('SCHEDULE', 'ALWAYS_OPEN', 'BY_APPOINTMENT');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('LOGO', 'COVER', 'GALLERY');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'YOUTUBE', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "ConnectAction" AS ENUM ('CALL', 'WHATSAPP', 'WEBSITE', 'EMAIL', 'DIRECTIONS');

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "enabledActions" "ConnectAction"[] DEFAULT ARRAY[]::"ConnectAction"[],
ADD COLUMN     "hoursNote" TEXT,
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openingHoursMode" "OpeningHoursMode" NOT NULL DEFAULT 'SCHEDULE';

-- CreateTable
CREATE TABLE "ProviderOpeningHours" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" INTEGER NOT NULL,
    "closesAt" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderOpeningHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSocialLink" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderOpeningHours_providerId_dayOfWeek_opensAt_key" ON "ProviderOpeningHours"("providerId", "dayOfWeek", "opensAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_providerId_kind_sortOrder_idx" ON "MediaAsset"("providerId", "kind", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSocialLink_providerId_platform_key" ON "ProviderSocialLink"("providerId", "platform");

-- AddForeignKey
ALTER TABLE "ProviderOpeningHours" ADD CONSTRAINT "ProviderOpeningHours_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSocialLink" ADD CONSTRAINT "ProviderSocialLink_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules Prisma can't express.
ALTER TABLE "ProviderOpeningHours"
  ADD CONSTRAINT "ProviderOpeningHours_day_range" CHECK ("dayOfWeek" BETWEEN 1 AND 7),
  ADD CONSTRAINT "ProviderOpeningHours_time_range" CHECK ("opensAt" >= 0 AND "closesAt" <= 1440 AND "opensAt" < "closesAt");

-- One logo and one cover per provider; gallery items are unlimited here (capped in the app).
CREATE UNIQUE INDEX "MediaAsset_one_logo" ON "MediaAsset" ("providerId") WHERE "kind" = 'LOGO';
CREATE UNIQUE INDEX "MediaAsset_one_cover" ON "MediaAsset" ("providerId") WHERE "kind" = 'COVER';
