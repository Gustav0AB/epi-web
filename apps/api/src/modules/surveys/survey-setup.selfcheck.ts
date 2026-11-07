import { OptionLabelsSchema, SurveyFiltersSchema } from "@epi/shared";
import { resolveSurveyMoment } from "./survey-moment.js";
import { MomentMappingSchema } from "@epi/shared";
import { resolveParticipantIdentifier } from "./participant-identifier.js";
import type { JotformPayload } from "./surveys.schema.js";
import assert from "node:assert/strict";
import { SaveSurveySetupSchema } from "@epi/shared";
import { prisma } from "../../db/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { registerDefinition } from "./surveys.service.js";
import { surveysRepository } from "./surveys.repository.js";
import { jotformClient } from "./jotform-client.js";
import { getSurveySetup, saveSurveySetup } from "./survey-setup.service.js";

const actor = { sub: "admin", username: "admin", role: "system_admin", organizationId: null, featureKeys: [] };
const empty = { siteId: null, type: "LOCAL" as const, instrumentName: "Learning Survey", activityName: "" };
let form: { setupDraft: typeof empty | null; setupRevision: number } | null = { setupDraft: null, setupRevision: 0 };
let siteExists = true;
let lockCount = 1;
let registered = 0;
let writes = 0;
let audits = 0;
const options: { kind: string; key: string; name: string }[] = [];
prisma.jotformForm.findUnique = (async () => form ? { ...form, title: "Learning Survey" } : null) as unknown as typeof prisma.jotformForm.findUnique;
prisma.surveyDefinition.findFirst = (async () => null) as unknown as typeof prisma.surveyDefinition.findFirst;
prisma.site.findUnique = (async () => siteExists ? { id: "site" } : null) as unknown as typeof prisma.site.findUnique;
prisma.surveySetupOption.findMany = (async () => options) as unknown as typeof prisma.surveySetupOption.findMany;
const tx = {
  jotformForm: {
    updateMany: async (args: unknown) => {
      assert.deepEqual(args, { where: { id: "form", setupRevision: 0 }, data: { setupRevision: { increment: 1 } } });
      return { count: lockCount };
    },
    update: async (args: { data: { setupDraft: typeof empty } }) => { writes++; form = { setupDraft: args.data.setupDraft, setupRevision: 1 }; },
  },
  surveyDefinition: { findFirst: async () => registered ? { id: "existing", siteId: "site", type: "LOCAL" } : null },
  surveySetupOption: { upsert: async (args: { create: typeof options[number]; update: unknown }) => {
    assert.deepEqual(args.update, {});
    assert.equal(args.create.key, args.create.name.toLowerCase());
    const existing = options.find(o => o.kind === args.create.kind && o.key === args.create.key);
    if (existing) return existing;
    options.push(args.create);
    return args.create;
  } },
};
prisma.$transaction = (async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) as unknown as typeof prisma.$transaction;
auditService.record = async (...args) => {
  audits++;
  assert.deepEqual(args, [actor, "SURVEY_SETUP_SAVE", { type: "JotformForm", id: "form" }, { revision: 1 }]);
};
assert.deepEqual(await getSurveySetup("form"), { draft: empty, revision: 0, options: [] });
form = null;
await assert.rejects(() => getSurveySetup("missing"), { statusCode: 404 });
form = { setupDraft: null, setupRevision: 0 };
assert.deepEqual(await saveSurveySetup("form", { revision: 0, draft: empty }, actor), { draft: empty, revision: 1 });
assert.equal(options.length, 0);
const draft = { ...empty, questions: [{ externalId: "q1", text: "Corrected", type: "FREQUENCY" as const, role: "INFORMATIONAL" as const }], instrumentName: "  Learning   Survey ", activityName: "Field Trip" };
surveysRepository.listJotformAccounts = (async () => [{ id: "account", name: "Test", apiKey: "test", createdAt: new Date(), updatedAt: new Date() }]) as unknown as typeof surveysRepository.listJotformAccounts;
jotformClient.getFormProperties = async () => ({});
// Existing fixtures provide normalized questions; raw-source cases supply their own records.
jotformClient.getFormQuestionSource = async (formId, key) => JSON.parse(JSON.stringify(Object.fromEntries((await jotformClient.getFormQuestions(formId, key)).map(question => [question.qid ?? question.name!, question]))));
jotformClient.getFormQuestions = async () => [{ qid: "1", name: "q1", text: "Original question", type: "control_scale" }];
const saved = await saveSurveySetup("form", { revision: 0, draft }, actor);
assert.equal(saved.draft.instrumentName, "Learning Survey");
assert.deepEqual((await getSurveySetup("form")).draft, saved.draft);
const reused = await saveSurveySetup("form", { revision: 0, draft: { ...draft, instrumentName: "learning survey" } }, actor);
assert.equal(reused.draft.instrumentName, "Learning Survey");
assert.equal(options.length, 1);
assert.equal(audits, 3);
lockCount = 0;
await assert.rejects(() => saveSurveySetup("form", { revision: 0, draft }, actor), { statusCode: 409 });
lockCount = 1;
registered = 1;
await assert.rejects(() => saveSurveySetup("form", { revision: 0, draft }, actor), { statusCode: 409 });
siteExists = false;
await assert.rejects(() => saveSurveySetup("form", { revision: 0, draft: { ...draft, siteId: "00000000-0000-4000-8000-000000000001" } }, actor), { statusCode: 400 });
assert.equal(writes, 3);
assert.equal(audits, 3);
for (const input of [{ revision: 0, draft: { ...draft, questions: [{ externalId: "q1", text: "Text", type: "LIKERT", role: "INVALID" }] } }, { revision: 0, draft: { ...draft, questions: [draft.questions[0], draft.questions[0]] } }, { revision: 0, draft: { ...draft, questions: [{ externalId: "q1", text: " ", type: "LIKERT" }] } }, { revision: 0, draft: { ...draft, questions: [{ externalId: "q1", text: "Text", type: "INVALID" }] } }, { revision: -1, draft }, { revision: 0.5, draft }, { revision: 0, draft: { ...draft, type: "INVALID" } }, { revision: 0, draft: { ...draft, instrumentName: "x".repeat(101) } }]) {
  assert.equal(SaveSurveySetupSchema.safeParse(input).success, false);
}
// Invalid confirmations must fail before contacting Jotform or creating a definition.
let globalAdmin = true;
surveysRepository.findScopeUser = (async () => ({ role: globalAdmin ? "SYSTEM_ADMIN" : "USER", organizationId: null, siteIds: [], excludedSurveyDefinitionIds: [] })) as unknown as typeof surveysRepository.findScopeUser;
jotformClient.getFormQuestions = async () => { assert.fail("Invalid registration contacted Jotform"); };
surveysRepository.createDefinitionWithQuestions = async () => { assert.fail("Invalid registration created a definition"); };
const siteId = "00000000-0000-4000-8000-000000000001";
const input = { jotformFormId: "form", siteId, type: "LOCAL" as const, setupRevision: 1 };
const configured = { ...empty, instrumentName: "Survey", activityName: "Trip", siteId };
prisma.jotformForm.findUnique = (async () => ({ title: "Survey", setupDraft: configured, setupRevision: 1 })) as unknown as typeof prisma.jotformForm.findUnique;
await assert.rejects(() => registerDefinition({ ...input, setupRevision: 0 }, actor.sub), { statusCode: 409 });
await assert.rejects(() => registerDefinition({ ...input, type: "VISITING" }, actor.sub), { statusCode: 409 });
await assert.rejects(() => registerDefinition({ ...input, siteId: "00000000-0000-4000-8000-000000000002" }, actor.sub), { statusCode: 409 });
configured.instrumentName = "";
await assert.rejects(() => registerDefinition(input, actor.sub), { statusCode: 400 });
configured.instrumentName = "Survey";
configured.activityName = "";
await assert.rejects(() => registerDefinition(input, actor.sub), { statusCode: 400 });
globalAdmin = false;
await assert.rejects(() => registerDefinition(input, actor.sub), { statusCode: 403 });
console.log("✓ survey-setup self-check passed (save/reopen, catalog, conflicts, validation, audit, registration guards)");

const identifier = { externalId: "student_code", role: "IDENTIFIER" };
const payload: JotformPayload = { formID: "f", submissionID: "s", surveyMoment: "PRE", participant: { id: "legacy-id" }, answers: [] };
assert.equal(resolveParticipantIdentifier(payload, []), "legacy-id");
assert.equal(resolveParticipantIdentifier(payload, [identifier]), null);
for (const value of ["", "  ", ["A", "B"], Infinity]) {
  assert.equal(resolveParticipantIdentifier({ ...payload, answers: [{ questionId: identifier.externalId, value }] }, [identifier]), null);
}
for (const [value, expected] of [["  ID-001  ", "ID-001"], [0, "0"], [123, "123"]] as const) {
  assert.equal(resolveParticipantIdentifier({ ...payload, answers: [{ questionId: identifier.externalId, value }] }, [identifier]), expected);
}
assert.equal(resolveParticipantIdentifier({ ...payload, answers: [{ questionId: identifier.externalId, value: "A" }, { questionId: identifier.externalId, value: "B" }] }, [identifier]), null);
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...draft, questions: [
  { externalId: "a", text: "A", type: "OPEN_TEXT", role: "IDENTIFIER" },
  { externalId: "b", text: "B", type: "OPEN_TEXT", role: "IDENTIFIER" },
] } }).success, false);
console.log("✓ participant identifier validation and legacy fallback passed");

const momentField = { externalId: "moment", role: "MOMENT", momentMappings: [{ value: "Before", moment: "PRE" }, { value: "After", moment: "POST" }, { value: "Follow-up", moment: "POST_POST" }] };
for (const mapping of momentField.momentMappings) {
  assert.equal(resolveSurveyMoment({ ...payload, answers: [{ questionId: "moment", value: ` ${mapping.value} ` }] }, [momentField]), mapping.moment);
}
assert.equal(resolveSurveyMoment(payload, []), "PRE");
for (const value of ["", "Unknown", ["Before", "After"], 1]) {
  assert.equal(resolveSurveyMoment({ ...payload, answers: [{ questionId: "moment", value }] }, [momentField]), "UNKNOWN");
}
assert.equal(resolveSurveyMoment(payload, [momentField]), "UNKNOWN");
assert.equal(resolveSurveyMoment({ ...payload, answers: [{ questionId: "moment", value: "Before" }, { questionId: "moment", value: "After" }] }, [momentField]), "UNKNOWN");
assert.equal(MomentMappingSchema.safeParse([{ value: "Before", moment: "PRE" }, { value: "Before", moment: "POST" }]).success, false);
assert.equal(MomentMappingSchema.safeParse([{ value: "Before", moment: "CQS" }]).success, false);
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...draft, questions: [
  { externalId: "a", text: "A", type: "ONE_ANSWER", role: "MOMENT" },
  { externalId: "b", text: "B", type: "ONE_ANSWER", role: "MOMENT" },
] } }).success, false);
console.log("✓ moment mapping validation, unknown answers and legacy fallback passed");

const partialWeightDraft = { ...draft, questions: [{ externalId: "q1", text: "Score", type: "LIKERT", weight: { category: "", subcategory: null, maxScore: null, correctAnswer: null } }] };
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: partialWeightDraft }).success, true);
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...partialWeightDraft, questions: [{ ...partialWeightDraft.questions[0], weight: { category: "Learning", maxScore: Infinity } }] } }).success, false);

assert.equal(OptionLabelsSchema.safeParse([{ value: "A", label: "Alpha" }, { value: "A", label: "Another" }]).success, false);
assert.equal(OptionLabelsSchema.safeParse([{ value: "A", label: " " }]).success, false);
assert.equal(SurveyFiltersSchema.safeParse({ questionId: "00000000-0000-4000-8000-000000000001" }).success, false);
assert.equal(SurveyFiltersSchema.safeParse({ answerValue: "A" }).success, false);
assert.equal(SurveyFiltersSchema.safeParse({ questionId: "00000000-0000-4000-8000-000000000001", answerValue: "A" }).success, true);

for (const timeZone of ["UTC", "America/Mazatlan", ""]) {
  assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...empty, timeZone, description: "Context" } }).success, true);
}
for (const timeZone of ["America/Invalid", "+07:00", "x".repeat(101)]) {
  assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...empty, timeZone } }).success, false);
}
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...empty, description: "x".repeat(2001) } }).success, false);
assert.equal(SaveSurveySetupSchema.parse({ revision: 0, draft: { ...empty, description: "  Context  " } }).draft.description, "Context");

assert.equal(SaveSurveySetupSchema.parse({ revision: 0, draft: { ...empty, activityType: "  Day   Trip  " } }).draft.activityType, "Day Trip");
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...empty, activityType: "x".repeat(101) } }).success, false);

const schoolQuestion = { externalId: "school-custom", text: "School", type: "OPEN_TEXT", role: "SCHOOL_GROUP" };
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...empty, questions: [schoolQuestion] } }).success, true);
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...empty, questions: [schoolQuestion, { ...schoolQuestion, externalId: "other-school" }] } }).success, false);

const activityQuestion = { externalId: "activity-custom", text: "Activity", type: "OPEN_TEXT", role: "ACTIVITY" };
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...empty, questions: [activityQuestion] } }).success, true);
assert.equal(SaveSurveySetupSchema.safeParse({ revision: 0, draft: { ...empty, questions: [activityQuestion, { ...activityQuestion, externalId: "other-activity" }] } }).success, false);

// Catalog validation applies at registration; incomplete/old draft strings can still be saved.
const { validateSetupQuestionCatalog } = await import("./survey-setup.service.js");
let categoryReads = 0;
let catalogOrganization: string | null = "org";
prisma.surveyDefinition.findFirst = (async () => null) as unknown as typeof prisma.surveyDefinition.findFirst;
prisma.site.findUnique = (async () => ({ organizationId: catalogOrganization })) as unknown as typeof prisma.site.findUnique;
prisma.category.findMany = (async (args: unknown) => {
  categoryReads++;
  assert.deepEqual(args, { where: { organizationId: "org", isActive: true } });
  return [{ name: "Learning", subcategory: "Knowledge", organizationId: "org", isActive: true }];
}) as unknown as typeof prisma.category.findMany;
const catalogQuestion = { externalId: "q", text: "Catalog question", type: "LIKERT" as const, weight: { category: "Learning", subcategory: "Knowledge", maxScore: 5, correctAnswer: null } };
await validateSetupQuestionCatalog([{ ...catalogQuestion, role: "EXCLUDED" }], "site");
assert.equal(categoryReads, 0);
await validateSetupQuestionCatalog([catalogQuestion], "site");
assert.equal(categoryReads, 1);
await assert.rejects(() => validateSetupQuestionCatalog([{ ...catalogQuestion, weight: { ...catalogQuestion.weight, subcategory: "Foreign" } }], "site"), { statusCode: 400 });
catalogOrganization = null;
await assert.rejects(() => validateSetupQuestionCatalog([catalogQuestion], "site"), { statusCode: 400 });
assert.equal(categoryReads, 2, "An organization-less site must not query a global catalog");
console.log("✓ current question catalog validation is scoped and requires an organization passed");
