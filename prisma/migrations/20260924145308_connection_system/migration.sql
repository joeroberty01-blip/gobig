-- CreateEnum
CREATE TYPE "ConnectSource" AS ENUM ('PROFILE', 'CARD', 'MAP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConnectAction" ADD VALUE 'BOOK_SERVICE';
ALTER TYPE "ConnectAction" ADD VALUE 'BOOK_RIDE';
ALTER TYPE "ConnectAction" ADD VALUE 'REQUEST_QUOTE';
ALTER TYPE "ConnectAction" ADD VALUE 'MESSAGE';

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "bookingUrl" TEXT,
ADD COLUMN     "rideUrl" TEXT;

-- CreateTable
CREATE TABLE "ConnectEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "action" "ConnectAction" NOT NULL,
    "source" "ConnectSource" NOT NULL,
    "day" DATE NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectEvent_providerId_day_idx" ON "ConnectEvent"("providerId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectEvent_providerId_action_visitorHash_day_key" ON "ConnectEvent"("providerId", "action", "visitorHash", "day");

-- AddForeignKey
ALTER TABLE "ConnectEvent" ADD CONSTRAINT "ConnectEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
