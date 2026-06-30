import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FEATURES_REGISTRY } from "@epi/shared";

const prisma = new PrismaClient();

async function seedFeatures() {
  const features = Object.values(FEATURES_REGISTRY);
  for (const f of features) {
    await prisma.feature.upsert({
      where: { key: f.key },
      create: { key: f.key, name: f.name, description: f.description },
      update: { name: f.name, description: f.description },
    });
  }
  console.log(`Seeded ${features.length} features.`);
}

async function seedAdminUser() {
  const username = "epi_admin";
  const email = "epi_admin@epi.local";

  // Fix existing admin whose username was set to email by the migration default
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.username !== username) {
      await prisma.user.update({ where: { email }, data: { username } });
      console.log("Updated admin username to:", username);
    } else {
      console.log("Default admin user already exists, skipping.");
    }
    return;
  }

  const password = await bcrypt.hash("epi_admin", 10);

  await prisma.user.create({
    data: { name: "Epi Admin", username, email, password, role: "ADMIN" },
  });

  console.log("Created default admin user:");
  console.log("  Username: epi_admin");
  console.log("  Password: epi_admin");
}

async function main() {
  await seedFeatures();
  await seedAdminUser();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
