ALTER TABLE "assistant_imports"
  ADD COLUMN "autoSync" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
CREATE INDEX "assistant_imports_nextAttemptAt_idx" ON "assistant_imports"("nextAttemptAt");
UPDATE "assistant_imports" SET "nextAttemptAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('RUNNING', 'INTERRUPTED');
