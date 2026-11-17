ALTER TABLE "submissions" ADD COLUMN "autoCourseDisabled" BOOLEAN NOT NULL DEFAULT false;

-- Preserve explicit removals already recorded by the manual course workflow.
UPDATE "submissions" s SET "autoCourseDisabled" = true
WHERE EXISTS (
  SELECT 1 FROM "audit_logs" a
  WHERE a."action" = 'COURSE_RESPONSES_LINK' AND a."metadata"->'linked' = 'false'::jsonb
    AND a."metadata"->'responseIds' ? s."id"
);
