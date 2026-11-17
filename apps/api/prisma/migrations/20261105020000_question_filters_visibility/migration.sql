ALTER TABLE "questions" ADD COLUMN "isFilter" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "visibility" JSONB;
UPDATE "questions" SET "isFilter" = true, "role" = 'INFORMATIONAL' WHERE "role" = 'FILTER';
ALTER TABLE "survey_definitions" ADD COLUMN "sourceConditions" TEXT;
