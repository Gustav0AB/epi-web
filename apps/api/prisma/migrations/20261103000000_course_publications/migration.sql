CREATE TABLE "course_publications" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "school" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "surveyDefinitionIds" TEXT[],
  "snapshot" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_publications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "course_publications_siteId_school_date_version_key" ON "course_publications"("siteId", "school", "date", "version");
ALTER TABLE "course_publications" ADD CONSTRAINT "course_publications_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
