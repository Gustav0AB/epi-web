ALTER TABLE "course_editions" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "course_editions" ADD CONSTRAINT "course_editions_status_check" CHECK ("status" IN ('DRAFT', 'REVIEWED', 'COMPLETED'));
