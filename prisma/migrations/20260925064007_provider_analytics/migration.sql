-- CreateEnum
CREATE TYPE "MetricKind" AS ENUM ('PROFILE_VIEW', 'SEARCH_APPEARANCE');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('SEARCH', 'AI_SEARCH', 'CATEGORY', 'HOME', 'REQUEST', 'SAVED', 'OTHER');

-- CreateTable
CREATE TABLE "ProviderMetric" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "MetricKind" NOT NULL,
    "source" "MetricSource" NOT NULL,
    "serviceId" TEXT,
    "locationId" TEXT,
    "day" DATE NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderMetric_providerId_kind_day_idx" ON "ProviderMetric"("providerId", "kind", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderMetric_providerId_kind_visitorHash_day_key" ON "ProviderMetric"("providerId", "kind", "visitorHash", "day");

-- CreateIndex
CREATE INDEX "Favorite_providerId_createdAt_idx" ON "Favorite"("providerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_providerId_key" ON "Favorite"("userId", "providerId");

-- AddForeignKey
ALTER TABLE "ProviderMetric" ADD CONSTRAINT "ProviderMetric_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMetric" ADD CONSTRAINT "ProviderMetric_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMetric" ADD CONSTRAINT "ProviderMetric_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
