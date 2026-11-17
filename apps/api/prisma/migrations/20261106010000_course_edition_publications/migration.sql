CREATE TABLE "course_edition_publications" (
 "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "version" INTEGER NOT NULL, "actorId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "school" TEXT NOT NULL, "surveyDefinitionIds" TEXT[] NOT NULL,
 "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "course_edition_publications_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "course_edition_publications_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "course_edition_publications_courseId_version_key" ON "course_edition_publications"("courseId", "version");
CREATE INDEX "course_edition_publications_createdAt_idx" ON "course_edition_publications"("createdAt");
CREATE FUNCTION reject_course_publication_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published course snapshots are immutable'; END; $$;
CREATE TRIGGER course_publication_immutable BEFORE UPDATE OR DELETE ON "course_edition_publications" FOR EACH ROW EXECUTE FUNCTION reject_course_publication_mutation();
