CREATE TABLE "course_complements" (
 "courseId" TEXT NOT NULL, "definitionId" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "course_complements_pkey" PRIMARY KEY ("courseId", "definitionId"),
 CONSTRAINT "course_complements_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "course_complements_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "survey_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "course_complements_definitionId_idx" ON "course_complements"("definitionId");
INSERT INTO "course_complements" ("courseId", "definitionId", "createdBy", "createdAt")
SELECT c."id", r."complementaryDefinitionId", r."createdBy", r."createdAt" FROM "course_editions" c JOIN "instrument_relations" r ON r."primaryDefinitionId" = c."primaryDefinitionId";
