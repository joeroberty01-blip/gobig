-- CreateTable
CREATE TABLE "RankingConfig" (
    "id" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankingConfig_pkey" PRIMARY KEY ("id")
);
