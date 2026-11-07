import assert from "node:assert";
import { prisma } from "../../db/prisma.js";
import { scopeToDefinitionWhere, surveysRepository } from "./surveys.repository.js";

assert.strictEqual(scopeToDefinitionWhere(undefined), undefined);
assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: [] }), { siteId: { in: [] } });

assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1", "s2"] }), { siteId: { in: ["s1", "s2"] } });

assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1"], excludedSurveyDefinitionIds: ["d1"] }), {
  siteId: { in: ["s1"] },
  id: { notIn: ["d1"] },
});

assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1"], excludedSurveyDefinitionIds: [] }), {
  siteId: { in: ["s1"] },
});

console.log("✓ surveys.repository self-check passed");

let submissionWhere: any;
prisma.submission.findMany = (async (args: { where: unknown }) => { submissionWhere = args.where; return []; }) as unknown as typeof prisma.submission.findMany;
await surveysRepository.listSubmissions({ siteId: "outside", questionId: "question", answerValue: "raw" }, { siteIds: ["allowed"] });
assert.deepEqual(submissionWhere.surveyDefinition.siteId, { in: [] });
assert.deepEqual(submissionWhere.answers, { some: { questionId: "question", value: "raw", question: { OR: [{ isFilter: true }, { role: "FILTER" }] } } });
await surveysRepository.listSubmissions({ siteId: "allowed" }, { siteIds: ["allowed"] });
assert.deepEqual(submissionWhere.surveyDefinition.siteId, { in: ["allowed"] });

await surveysRepository.groupSearchRows({ scope: { siteIds: ["allowed"], excludedSurveyDefinitionIds: ["excluded"] }, siteId: "outside", surveyDefinitionId: "excluded" });
assert.deepEqual(submissionWhere.surveyDefinition, { AND: [
  { siteId: { in: ["allowed"] }, id: { notIn: ["excluded"] } },
  { siteId: "outside" }, { id: "excluded" },
] });

await surveysRepository.groupSearchRows({ from: "2026-12-31", to: "2026-12-31" });
assert.deepEqual(submissionWhere.receivedAt, { gte: new Date("2026-12-31T00:00:00.000Z"), lt: new Date("2027-01-01T00:00:00.000Z") });
await surveysRepository.groupSearchRows({ to: "2024-02-29" });
assert.deepEqual(submissionWhere.receivedAt, { lt: new Date("2024-03-01T00:00:00.000Z") });

for (const query of [surveysRepository.completedWithResults, surveysRepository.completedWithAnswers]) {
  await query({ surveyDefinitionId: "selected", scope: { siteIds: ["allowed"], excludedSurveyDefinitionIds: ["hidden"] } });
  assert.deepEqual(submissionWhere.surveyDefinition, { siteId: { in: ["allowed"] }, id: { notIn: ["hidden"] }, AND: [{ id: "selected" }] });
  assert.equal(submissionWhere.reviewExcluded, false);
  await query({ surveyDefinitionId: "hidden", scope: { siteIds: [], excludedSurveyDefinitionIds: ["hidden"] } });
  assert.deepEqual(submissionWhere.surveyDefinition, { siteId: { in: [] }, id: { notIn: ["hidden"] }, AND: [{ id: "hidden" }] });
}

await surveysRepository.completedWithAnswers({ submissionIds: [] });
assert.deepEqual(submissionWhere.id, { in: [] });
await surveysRepository.completedWithAnswers({ submissionIds: ["course-submission"], scope: { siteIds: ["allowed"] } });
assert.deepEqual(submissionWhere.id, { in: ["course-submission"] });
assert.deepEqual(submissionWhere.surveyDefinition.siteId, { in: ["allowed"] });

// Schools come from submissions visible to the reader, including definition exclusions.
let schoolWhere: any;
prisma.site.findMany = (async () => []) as unknown as typeof prisma.site.findMany;
prisma.category.findMany = (async () => []) as unknown as typeof prisma.category.findMany;
prisma.participant.findMany = (async (args: { where: unknown; distinct: string[] }) => {
  schoolWhere = args.where;
  assert.deepEqual(args.distinct, ["school"]);
  return [{ school: null }, { school: "" }, { school: "   " }, { school: "CBTIS 62" }];
}) as unknown as typeof prisma.participant.findMany;
assert.deepEqual((await surveysRepository.reportFilterOptions({ siteIds: ["allowed"], excludedSurveyDefinitionIds: ["hidden"] })).schools, ["CBTIS 62"]);
assert.deepEqual(schoolWhere.submissions.some.surveyDefinition, { siteId: { in: ["allowed"] }, id: { notIn: ["hidden"] } });
await surveysRepository.reportFilterOptions({ siteIds: [] });
assert.deepEqual(schoolWhere.submissions.some.surveyDefinition, { siteId: { in: [] } });
await surveysRepository.reportFilterOptions({});
assert.deepEqual(schoolWhere.submissions, { some: { surveyDefinition: {} } });

await surveysRepository.groupSearchRows({ includeUnprocessed: true, scope: { siteIds: ["allowed"], excludedSurveyDefinitionIds: ["hidden"] } });
assert.equal("participant" in submissionWhere, false, "Review must not require participant identity");
assert.deepEqual(submissionWhere.surveyDefinition.AND[0], { siteId: { in: ["allowed"] }, id: { notIn: ["hidden"] } });

// Reuse discovery and source questions retain site/definition restrictions.
let definitionArgs: any;
prisma.surveyDefinition.findMany = (async (args: unknown) => {
  definitionArgs = args;
  return [{ id: "source", siteId: "allowed", jotformFormId: "source-form", type: "LOCAL", version: 2, instrumentKind: "CQS", openQuestionsSummary: null, site: { organizationId: "org" }, questions: [] }];
}) as unknown as typeof prisma.surveyDefinition.findMany;
prisma.jotformForm.findMany = (async () => [{ id: "source-form", title: "Source", account: { name: "Alias" } }]) as unknown as typeof prisma.jotformForm.findMany;
const reusableDefinitions = await surveysRepository.listDefinitions({ siteIds: ["allowed"], excludedSurveyDefinitionIds: ["hidden"] });
assert.deepEqual(definitionArgs.where, { siteId: { in: ["allowed"] }, id: { notIn: ["hidden"] } });
assert.equal(definitionArgs.select.instrumentKind, true);
assert.equal(reusableDefinitions[0]!.instrumentKind, "CQS");
let questionArgs: any;
const analysisScoring = [{ analysisType: "pre_post", maxScore: 2, correctAnswer: "A" }];
prisma.question.findMany = (async (args: unknown) => { questionArgs = args; return [{ id: "q", analysisScoring, answers: [] }]; }) as unknown as typeof prisma.question.findMany;
assert.deepEqual((await surveysRepository.getDefinitionQuestions("source", { siteIds: ["allowed"], excludedSurveyDefinitionIds: ["hidden"] }))[0]!.analysisScoring, analysisScoring);
assert.deepEqual(questionArgs.where, { surveyDefinitionId: "source", surveyDefinition: { siteId: { in: ["allowed"] }, id: { notIn: ["hidden"] } } });
console.log("✓ reusable analysis metadata and source questions remain scoped passed");
