BEGIN;
ALTER TABLE "jotform_forms" ADD COLUMN "setupDraft" JSONB,
  ADD COLUMN "setupRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "survey_definitions" ADD COLUMN "instrumentName" TEXT,
  ADD COLUMN "activityName" TEXT;
CREATE TABLE "survey_setup_options" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('INSTRUMENT', 'ACTIVITY')),
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL
);
CREATE UNIQUE INDEX "survey_setup_options_kind_key_key" ON "survey_setup_options"("kind", "key");
ALTER TABLE "jotform_forms" ALTER COLUMN "syncedAt" SET DEFAULT CURRENT_TIMESTAMP;
COMMIT;
