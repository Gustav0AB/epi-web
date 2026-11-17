ALTER TABLE "course_editions" ADD COLUMN "expectedParticipants" INTEGER;
ALTER TABLE "course_editions" ADD CONSTRAINT "course_expected_participants_positive" CHECK ("expectedParticipants" IS NULL OR "expectedParticipants" > 0);
