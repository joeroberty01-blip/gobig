-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContactPreference" AS ENUM ('IN_APP', 'CALL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('NOTIFIED', 'INTERESTED', 'QUOTED', 'DECLINED', 'ACCEPTED', 'NOT_SELECTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('CUSTOMER', 'PROVIDER');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "verifiedJob" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "serviceId" TEXT,
    "description" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "addressText" TEXT,
    "preferredDate" DATE,
    "preferredTime" INTEGER,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "contactPreference" "ContactPreference" NOT NULL DEFAULT 'IN_APP',
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "targetProviderId" TEXT,
    "acceptedProviderId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestPhoto" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestMatch" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'NOTIFIED',
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstResponseAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "validUntil" DATE,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "SenderRole" NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequest_customerId_createdAt_idx" ON "ServiceRequest"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_expiresAt_idx" ON "ServiceRequest"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestPhoto_storageKey_key" ON "RequestPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "RequestPhoto_requestId_idx" ON "RequestPhoto"("requestId");

-- CreateIndex
CREATE INDEX "RequestMatch_providerId_status_idx" ON "RequestMatch"("providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RequestMatch_requestId_providerId_key" ON "RequestMatch"("requestId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_requestId_providerId_key" ON "Quote"("requestId", "providerId");

-- CreateIndex
CREATE INDEX "Message_matchId_createdAt_idx" ON "Message"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_targetProviderId_fkey" FOREIGN KEY ("targetProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_acceptedProviderId_fkey" FOREIGN KEY ("acceptedProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestPhoto" ADD CONSTRAINT "RequestPhoto_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMatch" ADD CONSTRAINT "RequestMatch_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMatch" ADD CONSTRAINT "RequestMatch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RequestMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules Prisma cannot express.
ALTER TABLE "ServiceRequest"
  ADD CONSTRAINT "ServiceRequest_description_length" CHECK (char_length("description") BETWEEN 10 AND 2000),
  ADD CONSTRAINT "ServiceRequest_budget_non_negative" CHECK (("budgetMin" IS NULL OR "budgetMin" >= 0) AND ("budgetMax" IS NULL OR "budgetMax" >= 0)),
  ADD CONSTRAINT "ServiceRequest_budget_order" CHECK ("budgetMin" IS NULL OR "budgetMax" IS NULL OR "budgetMin" <= "budgetMax"),
  ADD CONSTRAINT "ServiceRequest_time_range" CHECK ("preferredTime" IS NULL OR "preferredTime" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "ServiceRequest_service_or_category" CHECK ("serviceId" IS NOT NULL OR "categoryId" IS NOT NULL),
  ADD CONSTRAINT "ServiceRequest_accepted_pair" CHECK (("acceptedProviderId" IS NULL) = ("acceptedAt" IS NULL) OR "status" = 'CANCELLED');
ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_amount_range" CHECK ("amount" > 0 AND "amount" <= 1000000000);
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000);
ALTER TABLE "RequestPhoto"
  ADD CONSTRAINT "RequestPhoto_size" CHECK ("bytes" > 0 AND "bytes" <= 5242880);

-- At most one accepted quote per request.
CREATE UNIQUE INDEX "Quote_one_accepted" ON "Quote" ("requestId") WHERE "status" = 'ACCEPTED';
