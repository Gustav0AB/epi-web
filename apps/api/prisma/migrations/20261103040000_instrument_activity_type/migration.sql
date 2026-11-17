BEGIN;
ALTER TABLE "survey_definitions" ADD COLUMN "activityType" TEXT;
ALTER TABLE "survey_setup_options" DROP CONSTRAINT "survey_setup_options_kind_check";
ALTER TABLE "survey_setup_options" ADD CONSTRAINT "survey_setup_options_kind_check" CHECK ("kind" IN ('INSTRUMENT', 'ACTIVITY', 'ACTIVITY_TYPE'));
COMMIT;
