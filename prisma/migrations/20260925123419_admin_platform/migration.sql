-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('PROVIDER', 'REQUEST', 'CONVERSATION');

-- CreateEnum
CREATE TYPE "ContentReportReason" AS ENUM ('SPAM', 'FAKE', 'FRAUD', 'OFFENSIVE', 'UNSAFE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'CUSTOMERS', 'PROVIDERS');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "providerId" TEXT,
    "reason" "ContentReportReason" NOT NULL,
    "note" TEXT,
    "reporterId" TEXT NOT NULL,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleSw" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodySw" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "supportWhatsapp" TEXT,
    "maxOpenRequests" INTEGER NOT NULL DEFAULT 5,
    "maxRequestMatches" INTEGER NOT NULL DEFAULT 15,
    "requestTtlDays" INTEGER NOT NULL DEFAULT 14,
    "aiSearchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules Prisma cannot express.
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500),
  ADD CONSTRAINT "Report_resolution_consistent" CHECK (("status" = 'OPEN') = ("resolvedAt" IS NULL));
ALTER TABLE "Announcement"
  ADD CONSTRAINT "Announcement_lengths" CHECK (char_length("titleEn") BETWEEN 3 AND 100 AND char_length("titleSw") BETWEEN 3 AND 100 AND char_length("bodyEn") BETWEEN 3 AND 1000 AND char_length("bodySw") BETWEEN 3 AND 1000);
ALTER TABLE "PlatformSettings"
  ADD CONSTRAINT "PlatformSettings_limits" CHECK ("maxOpenRequests" BETWEEN 1 AND 50 AND "maxRequestMatches" BETWEEN 1 AND 50 AND "requestTtlDays" BETWEEN 1 AND 60);
