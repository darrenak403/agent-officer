CREATE TABLE "UsageLimit" (
  "runtime" TEXT NOT NULL,
  "fiveHourPct" DOUBLE PRECISION,
  "fiveHourResetsAt" TIMESTAMP(3),
  "weekPct" DOUBLE PRECISION,
  "weekResetsAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageLimit_pkey" PRIMARY KEY ("runtime")
);
