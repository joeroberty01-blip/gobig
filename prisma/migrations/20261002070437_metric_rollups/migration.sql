-- CreateEnum
CREATE TYPE "RollupPeriod" AS ENUM ('WEEK', 'MONTH');

-- CreateTable
CREATE TABLE "MetricRollup" (
    "id" TEXT NOT NULL,
    "period" "RollupPeriod" NOT NULL,
    "periodStart" DATE NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricRollup_scope_scopeId_period_periodStart_idx" ON "MetricRollup"("scope", "scopeId", "period", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "MetricRollup_period_periodStart_scope_scopeId_key" ON "MetricRollup"("period", "periodStart", "scope", "scopeId");
