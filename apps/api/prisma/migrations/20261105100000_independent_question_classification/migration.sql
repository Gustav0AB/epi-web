ALTER TABLE "survey_definitions" ADD COLUMN "configurationVersion" INTEGER;
ALTER TABLE "questions" ADD COLUMN "classification" JSONB;
