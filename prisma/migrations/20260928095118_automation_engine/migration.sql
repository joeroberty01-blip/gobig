-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('RUNNING', 'DONE', 'SKIPPED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "eventId" TEXT,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "result" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_dispatchedAt_occurredAt_idx" ON "Event"("dispatchedAt", "occurredAt");

-- CreateIndex
CREATE INDEX "Event_subjectType_subjectId_idx" ON "Event"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "AutomationRun_ruleId_createdAt_idx" ON "AutomationRun"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRun_status_updatedAt_idx" ON "AutomationRun"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_ruleId_subjectKey_key" ON "AutomationRun"("ruleId", "subjectKey");

-- Carry the three existing rules over with their current settings (0 used to mean "off").
INSERT INTO "AutomationRule" ("id", "enabled", "params", "updatedAt")
SELECT 'review.auto-hide', "autoHideReviewAtReports" > 0, jsonb_build_object('threshold', GREATEST("autoHideReviewAtReports", 3)), now() FROM "PlatformSettings" WHERE "id" = 'default'
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "AutomationRule" ("id", "enabled", "params", "updatedAt")
SELECT 'request.unanswered-reminder', "requestReminderHours" > 0, jsonb_build_object('hours', GREATEST("requestReminderHours", 4)), now() FROM "PlatformSettings" WHERE "id" = 'default'
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "AutomationRule" ("id", "enabled", "params", "updatedAt")
SELECT 'driver.auto-offline', true, jsonb_build_object('afterMin', "driverAutoOfflineMin"), now() FROM "PlatformSettings" WHERE "id" = 'default'
ON CONFLICT ("id") DO NOTHING;
