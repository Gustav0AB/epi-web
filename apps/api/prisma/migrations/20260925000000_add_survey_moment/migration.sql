-- CreateEnum
CREATE TYPE "SurveyMoment" AS ENUM ('PRE', 'POST', 'CQS', 'UNKNOWN');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN "surveyMoment" "SurveyMoment" NOT NULL DEFAULT 'UNKNOWN';

-- Backfill existing pre/post data from the legacy boolean.
UPDATE "submissions"
SET "surveyMoment" = CASE
  WHEN "isPre" = true THEN 'PRE'::"SurveyMoment"
  WHEN "isPre" = false THEN 'POST'::"SurveyMoment"
  ELSE 'UNKNOWN'::"SurveyMoment"
END;
