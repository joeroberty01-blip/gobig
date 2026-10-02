-- CreateEnum
CREATE TYPE "RiskKind" AS ENUM ('REVIEW_BURST', 'NEW_ACCOUNT_REVIEWS', 'REQUEST_SPAM', 'MESSAGE_SPAM', 'REPEATED_REPORTS', 'TRIP_CANCELLATIONS', 'VERIFICATION_EXPIRING', 'VERIFICATION_EXPIRED');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateTable
CREATE TABLE "RiskFlag" (
    "id" TEXT NOT NULL,
    "kind" "RiskKind" NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskFlag_dedupeKey_key" ON "RiskFlag"("dedupeKey");

-- CreateIndex
CREATE INDEX "RiskFlag_status_createdAt_idx" ON "RiskFlag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RiskFlag_subjectType_subjectId_idx" ON "RiskFlag"("subjectType", "subjectId");
