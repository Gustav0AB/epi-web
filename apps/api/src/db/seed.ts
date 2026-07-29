import { Prisma, PrismaClient } from "@prisma/client";
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

// ─── Datos dummy para /reports (reportes dinámicos con filtros) ─────
// Una organización con 3 sitios, categorías, y ~60 participantes con
// submissions pre/post ya COMPLETADO + resultados agregados — para poder
// mover los filtros de sitio/tipo/escuela/categoría/fecha en /reports y
// ver los gráficos cambiar de inmediato en un entorno recién levantado.
// Idempotente: si ya hay submissions para estos sitios, no repite la carga.

const DEMO_REPORT_ORG = "Programa EPI Costa Rica";
const DEMO_SITES: { name: string; type: "LOCAL" | "VISITING" }[] = [
  { name: "Corcovado", type: "LOCAL" },
  { name: "Golfo Dulce", type: "LOCAL" },
  { name: "Talamanca", type: "VISITING" },
];
const DEMO_SCHOOLS = ["Escuela Central", "Colegio Técnico Osa", "Liceo Golfo Dulce"];
const DEMO_CATEGORIES: { name: string; subcategory: string | null }[] = [
  { name: "Conocimiento Ecológico", subcategory: "Biodiversidad" },
  { name: "Conocimiento Ecológico", subcategory: "Cambio Climático" },
  { name: "Actitudes de Conservación", subcategory: null },
  { name: "Habilidades de Campo", subcategory: "Identificación de Especies" },
  { name: "Habilidades de Campo", subcategory: "Monitoreo" },
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function seedDemoReportData() {
  const org = await prisma.organization.upsert({
    where: { name: DEMO_REPORT_ORG },
    create: { name: DEMO_REPORT_ORG },
    update: {},
  });

  const sites = await Promise.all(
    DEMO_SITES.map((s) =>
      prisma.site.upsert({
        where: { name: s.name },
        create: { name: s.name, organizationId: org.id },
        update: { organizationId: org.id },
      })
    )
  );

  const definitions = await Promise.all(
    sites.map(async (site, i) => {
      const jotformFormId = `demo-${site.id}`;
      const existing = await prisma.surveyDefinition.findFirst({ where: { jotformFormId, version: 1 } });
      if (existing) return existing;
      return prisma.surveyDefinition.create({
        data: { siteId: site.id, jotformFormId, type: DEMO_SITES[i]!.type, version: 1 },
      });
    })
  );

  const alreadySeeded = await prisma.submission.findFirst({
    where: { surveyDefinitionId: { in: definitions.map((d) => d.id) } },
  });
  if (alreadySeeded) {
    console.log("Demo report data already seeded, skipping.");
  } else {
    for (const c of DEMO_CATEGORIES) {
      const existing = await prisma.category.findFirst({
        where: { organizationId: org.id, name: c.name, subcategory: c.subcategory },
      });
      if (!existing) await prisma.category.create({ data: { organizationId: org.id, name: c.name, subcategory: c.subcategory } });
    }

    const PARTICIPANTS = 60;
    for (let i = 0; i < PARTICIPANTS; i++) {
      const site = sites[i % sites.length]!;
      const definition = definitions[sites.indexOf(site)]!;
      const school = DEMO_SCHOOLS[i % DEMO_SCHOOLS.length]!;

      const participant = await prisma.participant.create({
        data: {
          externalId: `demo-participant-${i}`,
          name: `Estudiante Demo ${i + 1}`,
          age: randInt(12, 17),
          gender: i % 2 === 0 ? "F" : "M",
          school,
          groupName: `Grupo ${String.fromCharCode(65 + (i % 3))}`,
        },
      });

      const preDate = daysAgo(randInt(20, 90));
      const postDate = new Date(preDate.getTime() + randInt(10, 20) * 86400000);

      const preSubmission = await prisma.submission.create({
        data: {
          jotformSubmissionId: `demo-submission-${i}-pre`,
          surveyDefinitionId: definition.id,
          participantId: participant.id,
          rawJsonData: {},
          isPre: true,
          status: "COMPLETADO",
          receivedAt: preDate,
          processedAt: preDate,
        },
      });
      const postSubmission = await prisma.submission.create({
        data: {
          jotformSubmissionId: `demo-submission-${i}-post`,
          surveyDefinitionId: definition.id,
          participantId: participant.id,
          rawJsonData: {},
          isPre: false,
          status: "COMPLETADO",
          receivedAt: postDate,
          processedAt: postDate,
        },
      });

      for (const cat of DEMO_CATEGORIES) {
        const maxPossible = 20;
        const preScore = Math.round(maxPossible * (randInt(45, 75) / 100) * 10) / 10;
        const postScore = Math.round(maxPossible * (randInt(65, 98) / 100) * 10) / 10;
        await prisma.aggregatedResult.createMany({
          data: [
            { submissionId: preSubmission.id, category: cat.name, subcategory: cat.subcategory, calculatedScore: preScore, maxPossible, isPrePost: true },
            { submissionId: postSubmission.id, category: cat.name, subcategory: cat.subcategory, calculatedScore: postScore, maxPossible, isPrePost: false },
          ],
        });
      }
    }
    console.log(`Seeded ${PARTICIPANTS} demo participants with pre/post submissions across ${sites.length} sites for reports.`);
  }

  // Usuario report_viewer con acceso solo a /interactive-reports
  // (mutuamente excluyente con /reports), ligado a esta organización.
  const rvUsername = "report_viewer_demo";
  const rvEmail = "report_viewer_demo@epi.local";
  const rvPassword = "report_viewer_demo";
  let rv = await prisma.user.findUnique({ where: { email: rvEmail } });
  if (!rv) {
    rv = await prisma.user.create({
      data: {
        name: "Reportes Demo",
        username: rvUsername,
        email: rvEmail,
        password: await bcrypt.hash(rvPassword, 10),
        role: "REPORT_VIEWER",
        organizationId: org.id,
      },
    });
    console.log(`Created ${rvUsername} (report_viewer), password: ${rvPassword}`);
  }
  await prisma.userReportTemplate.deleteMany({ where: { userId: rv.id } });
  await prisma.userReportTemplate.create({ data: { userId: rv.id, templateKey: "interactive_reports" } });

  const existingAssigned = await prisma.assignedReport.findFirst({
    where: { userId: rv.id, templateKey: "seasonal-site-report" },
  });
  if (!existingAssigned) {
    const report = await prisma.assignedReport.create({
      data: {
        userId: rv.id,
        templateKey: "seasonal-site-report",
        title: "Reporte de Temporada Demo",
        status: "PUBLISHED",
        textContent: {
          achievements: "Mejoras consistentes en resultados post por categoria.",
          challenges: "Mantener asistencia y seguimiento entre sedes.",
        },
      },
    });
    await prisma.assignedReportVersion.create({
      data: {
        reportId: report.id,
        version: report.version,
        title: report.title,
        status: report.status,
        textContent: (report.textContent ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        actorId: rv.id,
        actorUsername: rv.username,
      },
    });
  }
}

async function main() {
  await seedFeatures();
  await seedReportTemplates();
  await seedInstitutionalPositions();
  await seedAdminUser();
  await seedDemoOrganizations();
  await seedDemoReportData();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
