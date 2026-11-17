ALTER TYPE "SurveyType" ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TABLE "sites" ADD COLUMN "programs" TEXT[] NOT NULL DEFAULT ARRAY['Local','Visiting','Otro']::TEXT[], ADD COLUMN "activityTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "survey_definitions" ADD COLUMN "programName" TEXT, ADD COLUMN "instrumentKind" TEXT;
UPDATE "survey_definitions" SET "programName" = CASE "type" WHEN 'LOCAL' THEN 'Local' WHEN 'VISITING' THEN 'Visiting' ELSE 'Otro' END;
UPDATE "sites" s SET "activityTypes" = ARRAY(SELECT DISTINCT d."activityType" FROM "survey_definitions" d WHERE d."siteId" = s.id AND d."activityType" IS NOT NULL AND btrim(d."activityType") <> '' ORDER BY d."activityType");
