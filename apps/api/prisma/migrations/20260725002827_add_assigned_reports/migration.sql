-- CreateEnum
CREATE TYPE "ReportAssignmentStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'PUBLISHED');

-- CreateTable
CREATE TABLE "assigned_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ReportAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "filters" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assigned_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assigned_report_versions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ReportAssignmentStatus" NOT NULL,
    "filters" JSONB,
    "actorId" TEXT,
    "actorUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assigned_report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assigned_report_versions_reportId_version_key" ON "assigned_report_versions"("reportId", "version");

-- AddForeignKey
ALTER TABLE "assigned_reports" ADD CONSTRAINT "assigned_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assigned_report_versions" ADD CONSTRAINT "assigned_report_versions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "assigned_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
