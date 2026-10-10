-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'SMS';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "sms" BOOLEAN NOT NULL DEFAULT true;
