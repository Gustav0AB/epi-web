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

// Las dos plantillas que hoy tienen una página propia (/reports,
// /interactive-reports); un system_admin puede agregar más desde Settings.
const DEFAULT_REPORT_TEMPLATES = [
  { key: "reports", name: "Reportes", description: "Acceso a la página de reportes" },
  { key: "interactive_reports", name: "Reportes interactivos", description: "Acceso a la página de reportes interactivos" },
];

async function seedReportTemplates() {
  for (const t of DEFAULT_REPORT_TEMPLATES) {
    await prisma.reportTemplate.upsert({
      where: { key: t.key },
      create: t,
      update: { name: t.name, description: t.description },
    });
  }
  console.log(`Seeded ${DEFAULT_REPORT_TEMPLATES.length} report templates.`);
}

// Cargos institucionales por defecto — el admin puede agregar más desde el
// dropdown "Otro" al crear un usuario (POST /api/institutional-positions).
const DEFAULT_INSTITUTIONAL_POSITIONS = ["Administrador global", "Coordinador", "Chaperón"];

async function seedInstitutionalPositions() {
  for (const name of DEFAULT_INSTITUTIONAL_POSITIONS) {
    await prisma.institutionalPosition.upsert({ where: { name }, create: { name }, update: {} });
  }
  console.log(`Seeded ${DEFAULT_INSTITUTIONAL_POSITIONS.length} institutional positions.`);
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
    data: { name: "Epi Admin", username, email, password, role: "SYSTEM_ADMIN" },
  });

  console.log("Created default admin user:");
  console.log("  Username: epi_admin");
  console.log("  Password: epi_admin");
}

// Fixture para probar aislamiento multiorganización en dev: dos
// organizaciones, cada una con su sitio y su org_admin, para verificar que
// uno no ve datos del otro sin tener que darlos de alta a mano.
const DEMO_ORGS = [
  {
    orgName: "Organización Demo A",
    siteName: "Sitio Demo A",
    admin: { name: "Org Admin A", username: "org_admin_a", email: "org_admin_a@epi.local", password: "org_admin_a" },
  },
  {
    orgName: "Organización Demo B",
    siteName: "Sitio Demo B",
    admin: { name: "Org Admin B", username: "org_admin_b", email: "org_admin_b@epi.local", password: "org_admin_b" },
  },
];

async function seedDemoOrganizations() {
  for (const { orgName, siteName, admin } of DEMO_ORGS) {
    const org = await prisma.organization.upsert({
      where: { name: orgName },
      create: { name: orgName },
      update: {},
    });
    await prisma.site.upsert({
      where: { name: siteName },
      create: { name: siteName, organizationId: org.id },
      update: { organizationId: org.id },
    });
    const existing = await prisma.user.findUnique({ where: { email: admin.email } });
    if (!existing) {
      const password = await bcrypt.hash(admin.password, 10);
      await prisma.user.create({
        data: {
          name: admin.name,
          username: admin.username,
          email: admin.email,
          password,
          role: "ORG_ADMIN",
          organizationId: org.id,
        },
      });
      console.log(`Created ${admin.username} (org_admin of "${orgName}"), password: ${admin.password}`);
    }
  }
  console.log(`Seeded ${DEMO_ORGS.length} demo organizations for isolation testing.`);
}

async function main() {
  await seedFeatures();
  await seedReportTemplates();
  await seedInstitutionalPositions();
  await seedAdminUser();
  await seedDemoOrganizations();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
