import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "epi_admin@epi.local";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log("Default admin user already exists, skipping.");
    return;
  }

  const password = await bcrypt.hash("epi_admin", 10);

  await prisma.user.create({
    data: {
      name: "Epi Admin",
      email,
      password,
      role: "ADMIN",
    },
  });

  console.log("Created default admin user:");
  console.log("  Email:    epi_admin@epi.local");
  console.log("  Password: epi_admin");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
