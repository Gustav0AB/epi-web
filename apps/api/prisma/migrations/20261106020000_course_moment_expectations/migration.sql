ALTER TABLE "course_editions" ADD COLUMN "expectedParticipantsPre" INTEGER, ADD COLUMN "expectedParticipantsPost" INTEGER;
-- Preserve the previously confirmed manual total in both moments; never infer it from receipts.
UPDATE "course_editions" SET "expectedParticipantsPre" = "expectedParticipants", "expectedParticipantsPost" = "expectedParticipants";
ALTER TABLE "course_editions" ADD CONSTRAINT "course_pre_expected_positive" CHECK ("expectedParticipantsPre" IS NULL OR "expectedParticipantsPre" > 0), ADD CONSTRAINT "course_post_expected_positive" CHECK ("expectedParticipantsPost" IS NULL OR "expectedParticipantsPost" > 0);
