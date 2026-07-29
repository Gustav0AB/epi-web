-- AlterTable
ALTER TABLE "assigned_report_versions" ADD COLUMN     "textContent" JSONB;

-- AlterTable
ALTER TABLE "assigned_reports" ADD COLUMN     "textContent" JSONB;
