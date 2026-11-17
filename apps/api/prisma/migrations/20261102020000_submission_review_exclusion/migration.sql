ALTER TABLE "submissions" ADD COLUMN "reviewExcluded" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "reviewedBy" TEXT, ADD COLUMN "reviewedAt" TIMESTAMP(3);
