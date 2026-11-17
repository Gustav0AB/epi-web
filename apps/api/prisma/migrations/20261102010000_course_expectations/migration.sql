CREATE TABLE "course_expectations" (
  "siteId" TEXT NOT NULL,
  "school" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "expectedParticipants" INTEGER NOT NULL CHECK ("expectedParticipants" > 0),
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_expectations_pkey" PRIMARY KEY ("siteId", "school", "date"),
  CONSTRAINT "course_expectations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
