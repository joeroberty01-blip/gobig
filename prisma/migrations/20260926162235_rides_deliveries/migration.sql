-- CreateEnum
CREATE TYPE "TripKind" AS ENUM ('RIDE', 'DELIVERY');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BODA', 'BAJAJI', 'CAR', 'VAN');

-- CreateEnum
CREATE TYPE "PackageSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('OFFERED', 'DECLINED', 'EXPIRED', 'ACCEPTED', 'MISSED');

-- CreateEnum
CREATE TYPE "TripParty" AS ENUM ('CUSTOMER', 'DRIVER', 'SYSTEM', 'ADMIN');

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "offersRides" BOOLEAN NOT NULL DEFAULT false,
    "offersDelivery" BOOLEAN NOT NULL DEFAULT false,
    "vehicleType" "VehicleType" NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleColor" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "baseFare" INTEGER NOT NULL,
    "perKmFare" INTEGER NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "ratingAvg" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "kind" "TripKind" NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'REQUESTED',
    "customerId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "pickupSealed" TEXT,
    "dropoffSealed" TEXT,
    "pickupLatCoarse" DOUBLE PRECISION NOT NULL,
    "pickupLngCoarse" DOUBLE PRECISION NOT NULL,
    "dropoffLabel" TEXT NOT NULL,
    "pickupLabel" TEXT NOT NULL,
    "destinationProviderId" TEXT,
    "noteSealed" TEXT,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "packageSize" "PackageSize",
    "packageDescription" TEXT,
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "recipientNameSealed" TEXT,
    "recipientPhoneSealed" TEXT,
    "codeSealed" TEXT,
    "driverProviderId" TEXT,
    "fareBase" INTEGER,
    "farePerKm" INTEGER,
    "fareEstimate" INTEGER,
    "fareFinal" INTEGER,
    "paymentMethod" "PaymentMethod",
    "rating" INTEGER,
    "ratingComment" TEXT,
    "ratedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "TripParty",
    "cancelReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripOffer" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'OFFERED',
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "TripOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_providerId_key" ON "DriverProfile"("providerId");

-- CreateIndex
CREATE INDEX "DriverProfile_online_lastLat_lastLng_idx" ON "DriverProfile"("online", "lastLat", "lastLng");

-- CreateIndex
CREATE INDEX "Trip_customerId_createdAt_idx" ON "Trip"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Trip_driverProviderId_status_idx" ON "Trip"("driverProviderId", "status");

-- CreateIndex
CREATE INDEX "Trip_status_expiresAt_idx" ON "Trip"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Trip_status_completedAt_idx" ON "Trip"("status", "completedAt");

-- CreateIndex
CREATE INDEX "TripOffer_providerId_status_offeredAt_idx" ON "TripOffer"("providerId", "status", "offeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripOffer_tripId_providerId_key" ON "TripOffer"("tripId", "providerId");

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverProviderId_fkey" FOREIGN KEY ("driverProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destinationProviderId_fkey" FOREIGN KEY ("destinationProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripOffer" ADD CONSTRAINT "TripOffer_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripOffer" ADD CONSTRAINT "TripOffer_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Guards the application also enforces, kept in the database so no code path can bypass them.
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_rating_range" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5));
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_fares_non_negative" CHECK (COALESCE("fareFinal", 0) >= 0 AND COALESCE("fareEstimate", 0) >= 0);
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_fares_non_negative" CHECK ("baseFare" >= 0 AND "perKmFare" >= 0);
