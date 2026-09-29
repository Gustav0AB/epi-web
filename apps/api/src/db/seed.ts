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
  const username = "admin";
  const email = "admin@epi.local";

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

  const password = await bcrypt.hash("Admin1234!", 12);

  await prisma.user.create({
    data: { name: "System Admin", username, email, password, role: "SYSTEM_ADMIN", mustChangePassword: true },
  });

  console.log("Created default admin user:");
  console.log("  Username: admin");
  console.log("  Password: Admin1234!");
}

async function removeDemoUsers() {
  const { count } = await prisma.user.deleteMany({
    where: { username: { in: ["org_admin_a", "org_admin_b", "report_viewer_demo"] } },
  });
  if (count) console.log(`Removed ${count} demo users.`);
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

  const demoAnswers = [
    "Aprendí a observar el ecosistema con más detalle y a registrar evidencia.",
    "La actividad de campo fue lo más útil; me gustaría tener más tiempo para analizar los datos.",
    "Ahora entiendo mejor cómo mis decisiones afectan la conservación local.",
  ];
  for (const definition of definitions) {
    const question = await prisma.question.upsert({
      where: { surveyDefinitionId_externalId: { surveyDefinitionId: definition.id, externalId: "demo_open_feedback" } },
      create: {
        surveyDefinitionId: definition.id,
        externalId: "demo_open_feedback",
        text: "¿Qué fue lo más significativo de tu experiencia?",
        type: "OPEN_TEXT",
      },
      update: {},
    });
    if (!(await prisma.answer.count({ where: { questionId: question.id } }))) {
      const submissions = await prisma.submission.findMany({
        where: { surveyDefinitionId: definition.id, isPre: false },
        select: { id: true },
        take: 6,
      });
      await prisma.answer.createMany({
        data: submissions.map((submission, index) => ({
          submissionId: submission.id,
          questionId: question.id,
          value: demoAnswers[index % demoAnswers.length]!,
        })),
      });
    }
    await prisma.surveyDefinition.update({
      where: { id: definition.id },
      data: { openQuestionsSummary: "Los participantes destacan el aprendizaje práctico, la observación del ecosistema y una mayor conciencia de conservación." },
    });
  }

  // Usuario report_viewer con acceso solo a /interactive-reports
  // (mutuamente excluyente con /reports), ligado a esta organización.
  const rvUsername = "report_viewer_demo";
  const rvEmail = "report_viewer_demo@epi.local";
  const rvPassword = "report_viewer_demo";
  const existingViewer = await prisma.user.findUnique({ where: { email: rvEmail } });
  const viewerData = {
        name: "Reportes Demo",
        username: rvUsername,
        email: rvEmail,
        password: await bcrypt.hash(rvPassword, 10),
        role: "REPORT_VIEWER",
        organizationId: org.id,
      } as const;
  const rv = existingViewer
    ? await prisma.user.update({ where: { id: existingViewer.id }, data: viewerData })
    : await prisma.user.create({ data: viewerData });
  if (!existingViewer) {
    console.log(`Created ${rvUsername} (report_viewer), password: ${rvPassword}`);
  }
  await prisma.userReportTemplate.deleteMany({ where: { userId: rv.id } });
  await prisma.userReportTemplate.create({ data: { userId: rv.id, templateKey: "interactive_reports" } });

  const siteIds = sites.map((site) => site.id).join(",");
  const assignments = [
    {
      templateKey: "course-impacts-2026mx-ncssm",
      title: "NCSSM - Course Impacts",
      filters: { demo: "course-impacts-2026mx-ncssm", siteIds, school: "NCSSM" },
      textContent: {
        heroPhotoUrl: "/report-demo/ncssm-hero.jpg",
        studentQuote: '"This experience gave me a deep appreciation for La Paz, the Spanish language, the natural world around me, and the community I share these with."',
        recommendationText: "94% of participants indicated that they would recommend our Baja course to other students.",
        coursePhotoUrl: "/report-demo/ncssm-course.jpg",
        coursePhotoCaption: "Students observing wildlife during the Baja Marine Science course.",
        spotlightText: "Impact Spotlight: Scientific Method\n\nStudents investigate a research question in small groups on course with guidance from EPI instructors. During this project they engage in each step of the scientific process and each student builds confidence in their ability to conduct research and communicate results.\n\nThe students on this trip improved most in their self-reported ability to Construct Explanations and Analyze and Interpret.",
      },
    },
    {
      templateKey: "course-impacts-2026cr-burton",
      title: "Burr and Burton Academy - Course Impacts",
      filters: { demo: "course-impacts-2026cr-burton", siteIds, school: "Burr and Burton Academy" },
      textContent: {
        heroPhotoUrl: "/report-demo/burton-hero.jpg",
        studentQuote: "I feel like this experience changed me in the best way possible. I have never been so sad to leave a place and leave people that I have so strongly connected with in just the span of nine days. I will try my hardest to come back next year. This was an experience that cannot be traded for anything.",
        recommendationText: "100% of participants indicated that they would recommend our Costa Rica course to other students.",
        conservationImpacts: "8 nests monitored\n9 turtles worked\n3 nights of work on the field",
        coursePhotoUrl: "/report-demo/burton-course.jpg",
        coursePhotoCaption: "Students participating in conservation fieldwork in Costa Rica.",
        spotlightText: "Impact Spotlight: Scientific Process\n\nStudents investigate a research question in small groups on course with guidance from EPI instructors. During this project they engage in each step of the scientific process and each student builds confidence in their ability to conduct research and communicate results.\n\nThe students on this trip improved most in their self-reported ability to design a methodology, collect data, and analyze and interpret it.",
      },
    },
    {
      templateKey: "course-impacts-2026mx-templeton",
      title: "Templeton Academy - Course Impacts",
      filters: { demo: "course-impacts-2026mx-templeton", siteIds, school: "Templeton Academy" },
      textContent: {
        heroPhotoUrl: "/report-demo/templeton-hero.jpg",
        studentQuote: '"Something I learned throughout this trip... I am realizing how interested I am in marine biology, and while I cannot see it being a career, I can see it becoming a passion in my future." - Liam',
        recommendationText: "94% of participants indicated that they would recommend our Baja course to other students.",
        conservationImpacts: "2 groups of humpback whales observed.\n1 group (~18) of common dolphins observed.\n3.7 kg of waste collected (mainly plastics and cigarette butts).\n17 fish species identified.",
        coursePhotoUrl: "/report-demo/templeton-course.jpg",
        coursePhotoCaption: "Students recording field observations during the Baja course.",
        spotlightText: "Impact Spotlight: Scientific Method\n\nStudents investigate a research question in small groups on course with guidance from EPI instructors. During this project they engage in each step of the scientific process and each student builds confidence in their ability to conduct research and communicate results.\n\nThe students on this trip improved most in their self-reported ability to Construct Explanations, collect data, and Analyze and Interpret it.",
      },
    },
  ];

  await prisma.assignedReport.deleteMany({ where: { userId: rv.id } });
  for (const assignment of assignments) {
    const report = await prisma.assignedReport.create({
      data: {
        userId: rv.id,
        ...assignment,
        status: "PUBLISHED",
      },
    });
    await prisma.assignedReportVersion.create({
      data: {
        reportId: report.id,
        version: report.version,
        title: report.title,
        status: report.status,
        filters: (report.filters ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        textContent: (report.textContent ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        actorId: rv.id,
        actorUsername: rv.username,
      },
    });
  }
  console.log(`Seeded ${assignments.length} assigned report templates for ${rvUsername}.`);
}

async function main() {
  await seedFeatures();
  await seedReportTemplates();
  await seedInstitutionalPositions();
  await seedAdminUser();
  if (process.env.SEED_DEMO !== "true") {
    await removeDemoUsers();
    return;
  }
  await seedDemoOrganizations();
  await seedDemoReportData();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
