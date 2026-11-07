import { PrismaClient } from "@prisma/client";
import { planSiteAccessMigration } from "./site-access-migration.js";

const prisma = new PrismaClient({ log: ["error"] });
try {
  const [users, sites] = await prisma.$transaction([
    prisma.user.findMany({
      select: { id: true, role: true, organizationId: true, siteIds: true, excludedSiteIds: true },
      orderBy: { id: "asc" },
    }),
    prisma.site.findMany({
      select: { id: true, organizationId: true },
      orderBy: { id: "asc" },
    }),
  ], { isolationLevel: "RepeatableRead" });
  const plan = planSiteAccessMigration(users, sites);
  console.log(JSON.stringify(plan, null, 2));
  if (!plan.ready) process.exitCode = 1;
} catch (error) {
  console.error("Site access migration check failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
