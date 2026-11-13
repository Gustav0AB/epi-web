import assert from "node:assert/strict";
import { prisma } from "../../db/prisma.js";
import { surveysRepository } from "./surveys.repository.js";
import { JotformFormsQuerySchema } from "@epi/shared";
import { reprocessEarlierVersions, versionReprocessProgress } from "./version-reprocess.service.js";

assert.equal(process.env.NODE_ENV, "test");
assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/epi_version_reprocess_test");
try {
  const actor = await prisma.user.create({ data: { username: "version-admin", name: "Admin", email: "version@example.test", password: "unused", role: "SYSTEM_ADMIN" } });
  const org = await prisma.organization.create({ data: { name: "Test" } });
  const site = await prisma.site.create({ data: { name: "Test", organizationId: org.id } });
  const source = await prisma.surveyDefinition.create({ data: { siteId: site.id, jotformFormId: "version-test", version: 1, configurationVersion: 4 } });
  const target = await prisma.surveyDefinition.create({ data: { siteId: site.id, jotformFormId: "version-test", version: 2, configurationVersion: 4, instrumentKind: "LEARNING", questions: { create: [
    { externalId: "moment", text: "When", type: "ONE_ANSWER", role: "MOMENT", options: ["Before", "After", "Other"], momentMappings: [{ value: "Before", moment: "PRE" }, { value: "After", moment: "POST" }] },
    { externalId: "school", text: "School", type: "OPEN_TEXT", role: "SCHOOL_GROUP" },
  ] } } });
  async function submission(id: string, moment: string) { return prisma.submission.create({ data: { jotformSubmissionId: id, surveyDefinitionId: source.id, rawJsonData: { formID: "version-test", submissionID: id, created_at: "2026-08-28 10:00:00", answers: [{ questionId: "moment", value: moment }, { questionId: "school", value: "Escuela" }] } } }); }
  for (let i = 0; i < 7; i++) await prisma.jotformForm.create({ data: { id: `form-${i}`, title: `Formulario ${i}`, status: "ENABLED" } });
  await prisma.jotformForm.create({ data: { id: "version-test", title: "Instrumento configurado", status: "ENABLED" } });
  const configured = await surveysRepository.listJotformForms(JotformFormsQuerySchema.parse({ registered: "true" }));
  assert.equal(configured.meta.total, 1); assert.equal(configured.forms[0]?.id, "version-test");
  const unconfigured = await surveysRepository.listJotformForms(JotformFormsQuerySchema.parse({ registered: "false", page: 2 }));
  assert.equal(unconfigured.meta.total, 7); assert.equal(unconfigured.forms.length, 2);
  const all = await surveysRepository.listJotformForms(JotformFormsQuerySchema.parse({}));
  assert.equal(all.meta.total, 8);
  const blockedAccount = await prisma.jotformAccount.create({ data: { name: "Etiquetas", apiKey: "fake-label-key", excludedLabelIds: ["no"] } });
  await prisma.jotformForm.createMany({ data: [
    { id: "allowed-label", title: "Allowed", status: "ENABLED", accountId: blockedAccount.id, labelIds: ["yes"] },
    { id: "mixed-label", title: "Mixed", status: "ENABLED", accountId: blockedAccount.id, labelIds: ["yes", "no"] },
    { id: "empty-label", title: "Empty", status: "ENABLED", accountId: blockedAccount.id, labelIds: [] },
    { id: "no-account", title: "Unassociated", status: "ENABLED", labelIds: [] },
  ] });
  const visibleLabels = await surveysRepository.listJotformForms(JotformFormsQuerySchema.parse({ accountId: blockedAccount.id }));
  assert.deepEqual(visibleLabels.forms.map(item => item.id).sort(), ["allowed-label", "empty-label"]);
  assert.equal((await surveysRepository.listJotformForms(JotformFormsQuerySchema.parse({ accountId: blockedAccount.id, labelId: "no" }))).meta.total, 0);
  assert.equal((await surveysRepository.listJotformForms(JotformFormsQuerySchema.parse({ search: "Unassociated" }))).meta.total, 1);
  await prisma.jotformAccount.update({ where: { id: blockedAccount.id }, data: { excludedLabelIds: [] } });
  assert.equal((await surveysRepository.listJotformForms(JotformFormsQuerySchema.parse({ accountId: blockedAccount.id }))).meta.total, 3);
  const before = await submission("before", "Before");
  const unknown = await submission("unknown", "Other");
  const linked = await submission("linked", "After");
  const manual = await submission("manual", "Before");
  await prisma.submission.update({ where: { id: manual.id }, data: { reviewMoment: "POST", reviewSchool: "Escuela corregida" } });
  const invalid = await prisma.submission.create({ data: { jotformSubmissionId: "invalid", surveyDefinitionId: source.id, rawJsonData: { invalid: true } } });
  const course = await prisma.courseEdition.create({ data: { siteId: site.id, primaryDefinitionId: source.id, name: "Curso", school: "Escuela", activity: "Curso", createdBy: actor.id } });
  const app = await prisma.courseApplication.create({ data: { courseId: course.id, definitionId: source.id, contextKey: "test", date: "2026-08-28", moment: "POST" } });
  await prisma.courseMembership.create({ data: { submissionId: linked.id, applicationId: app.id, contextRevision: 0, createdBy: actor.id } });
  const result = await reprocessEarlierVersions("version-test", actor.id);
  assert.deepEqual(result, { total: 5, updated: 3, inCourse: 1, published: 0, pending: 1, errors: 1 });
  const progress = await versionReprocessProgress("version-test");
  assert.equal(progress?.state, "FINISHED"); assert.equal(progress?.processed, 5); assert.equal(progress?.errors, 1);
  const failure = await prisma.auditLog.findFirstOrThrow({ where: { action: "SURVEY_VERSION_REPROCESS_ERROR", targetId: invalid.id } });
  assert.equal((failure.metadata as any).reason, "ORIGINAL_REQUIRES_REVIEW");
  assert.ok(!JSON.stringify(failure.metadata).includes("answers"));
  const saved = await prisma.submission.findUniqueOrThrow({ where: { id: before.id }, include: { answers: true } });
  assert.equal(saved.surveyDefinitionId, target.id); assert.equal(saved.surveyMoment, "PRE"); assert.equal(saved.answers.length, 2);
  assert.equal((saved.rawJsonData as any).schoolContext.school, "Escuela");
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: unknown.id } })).surveyMoment, "UNKNOWN");
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: linked.id } })).surveyDefinitionId, source.id);
  const manualAfter = await prisma.submission.findUniqueOrThrow({ where: { id: manual.id } });
  assert.equal(manualAfter.surveyMoment, "POST"); assert.equal(manualAfter.reviewSchool, "Escuela corregida");
  const invalidAfter = await prisma.submission.findUniqueOrThrow({ where: { id: invalid.id } });
  assert.equal(invalidAfter.surveyDefinitionId, source.id); assert.equal(invalidAfter.contextRevision, 0);
  assert.equal(await prisma.auditLog.count({ where: { action: "SURVEY_VERSION_REPROCESS" } }), 3);
  const again = await reprocessEarlierVersions("version-test", actor.id);
  assert.equal(again.updated, 0); assert.equal(again.inCourse, 1);
  const concurrent = await submission("concurrent", "After");
  const runs = await Promise.all([reprocessEarlierVersions("version-test", actor.id), reprocessEarlierVersions("version-test", actor.id)]);
  assert.equal(runs.reduce((sum, run) => sum + run.updated, 0), 1);
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: concurrent.id } })).surveyDefinitionId, target.id);
  assert.equal(await prisma.auditLog.count({ where: { action: "SURVEY_VERSION_REPROCESS", targetId: concurrent.id } }), 1);
  const pubSource = await prisma.surveyDefinition.create({ data: { siteId: site.id, jotformFormId: "published-test", version: 1, configurationVersion: 4 } });
  await prisma.surveyDefinition.create({ data: { siteId: site.id, jotformFormId: "published-test", version: 2, configurationVersion: 4, questions: { create: { externalId: "q", text: "Question", type: "OPEN_TEXT", role: "INFORMATIONAL" } } } });
  await prisma.submission.create({ data: { jotformSubmissionId: "published-response", surveyDefinitionId: pubSource.id, rawJsonData: { formID: "published-test", submissionID: "published-response", answers: [] } } });
  await prisma.coursePublication.create({ data: { siteId: site.id, school: "Escuela", date: "2026-08-28", version: 1, surveyDefinitionIds: [pubSource.id], snapshot: {}, actorId: actor.id } });
  assert.equal((await reprocessEarlierVersions("published-test", actor.id)).published, 1);
  const loadSource = await prisma.surveyDefinition.create({ data: { siteId: site.id, jotformFormId: "volume-test", version: 1, configurationVersion: 4 } });
  const loadTarget = await prisma.surveyDefinition.create({ data: { siteId: site.id, jotformFormId: "volume-test", version: 2, configurationVersion: 4, instrumentKind: "CQS", questions: { create: { externalId: "q", text: "Question", type: "OPEN_TEXT", role: "INFORMATIONAL" } } } });
  const volume = 250;
  await prisma.submission.createMany({ data: Array.from({ length: volume }, (_, index) => ({ jotformSubmissionId: `volume-${index}`, surveyDefinitionId: loadSource.id, rawJsonData: { formID: "volume-test", submissionID: `volume-${index}`, answers: [{ questionId: "q", value: "ficticio" }] } })) });
  const started = Date.now(); const loadResult = await reprocessEarlierVersions("volume-test", actor.id);
  assert.equal(loadResult.total, volume); assert.equal(loadResult.updated, volume); assert.equal(loadResult.errors, 0);
  assert.equal(await prisma.submission.count({ where: { surveyDefinitionId: loadTarget.id } }), volume);
  assert.equal((await versionReprocessProgress("volume-test"))?.processed, volume);
  assert.ok(await prisma.auditLog.count({ where: { action: "SURVEY_VERSION_REPROCESS_PROGRESS", targetId: "volume-test" } }) >= 27);
  const interruptedSource = await prisma.surveyDefinition.create({ data: { siteId: site.id, jotformFormId: "interrupt-test", version: 1, configurationVersion: 4 } });
  const interruptedTarget = await prisma.surveyDefinition.create({ data: { siteId: site.id, jotformFormId: "interrupt-test", version: 2, configurationVersion: 4, instrumentKind: "CQS", questions: { create: { externalId: "q", text: "Question", type: "OPEN_TEXT", role: "INFORMATIONAL" } } } });
  await prisma.submission.createMany({ data: Array.from({ length: 12 }, (_, index) => ({ jotformSubmissionId: `interrupt-${index}`, surveyDefinitionId: interruptedSource.id, rawJsonData: { formID: "interrupt-test", submissionID: `interrupt-${index}`, answers: [{ questionId: "q", value: "ficticio" }] } })) });
  await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reprocess_interrupt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'SURVEY_VERSION_REPROCESS_PROGRESS' AND NEW."targetId" = 'interrupt-test' AND NEW.metadata->>'state' = 'RUNNING' AND (NEW.metadata->>'processed')::int >= 10 THEN RAISE EXCEPTION 'interrupcion simulada'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reprocess_interrupt BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_reprocess_interrupt()`);
  try { await assert.rejects(() => reprocessEarlierVersions("interrupt-test", actor.id)); }
  finally { await prisma.$executeRawUnsafe(`DROP TRIGGER test_reprocess_interrupt ON audit_logs`); await prisma.$executeRawUnsafe(`DROP FUNCTION test_reprocess_interrupt()`); }
  assert.equal((await versionReprocessProgress("interrupt-test"))?.state, "INTERRUPTED");
  assert.equal(await prisma.submission.count({ where: { surveyDefinitionId: interruptedTarget.id } }), 10);
  const resumed = await reprocessEarlierVersions("interrupt-test", actor.id);
  assert.equal(resumed.updated, 2); assert.equal(await prisma.submission.count({ where: { surveyDefinitionId: interruptedTarget.id } }), 12);
  console.log(`version reprocess integration passed: ${volume} synthetic responses in ${Date.now() - started} ms`);
} finally { await prisma.$disconnect(); }
