ALTER TABLE "survey_definitions" ADD COLUMN "matrixDefaults" JSONB;
ALTER TABLE "questions" ADD COLUMN "sourceContext" JSONB;
ALTER TABLE "questions" ADD COLUMN "matrixOverride" BOOLEAN NOT NULL DEFAULT false;
