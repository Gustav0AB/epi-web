ALTER TABLE "jotform_forms"
  ADD COLUMN "createdAt" TEXT,
  ADD COLUMN "updatedAt" TEXT,
  ADD COLUMN "submissionCount" INTEGER,
  ADD COLUMN "lastSubmission" TEXT,
  ADD COLUMN "url" TEXT;
