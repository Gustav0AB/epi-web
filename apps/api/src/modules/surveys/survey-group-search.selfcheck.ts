import { SubmissionMomentReviewSchema, CourseExpectationSchema, SurveyGroupSearchSchema } from "@epi/shared";
import assert from "node:assert";
import { summarizeGroupSearchRows } from "./surveys.service.js";

const result = summarizeGroupSearchRows([
  {
    reviewExcluded: false,
    status: "PROCESADO",
    receivedAt: new Date("2026-01-10T10:00:00Z"),
    surveyMoment: "PRE",
    surveyDefinition: { siteId: "site-a" },
    participantId: "p1",
    participant: { school: "Escuela A" },
    results: [{ calculatedScore: 5, maxPossible: 10 }],
  },
  {
    reviewExcluded: false,
    status: "PROCESADO",
    receivedAt: new Date("2026-01-10T12:00:00Z"),
    surveyMoment: "POST",
    surveyDefinition: { siteId: "site-a" },
    participantId: "p1",
    participant: { school: "Escuela A" },
    results: [{ calculatedScore: 8, maxPossible: 10 }],
  },
  {
    reviewExcluded: false,
    status: "PROCESADO",
    receivedAt: new Date("2026-01-10T13:00:00Z"),
    surveyMoment: "CQS",
    surveyDefinition: { siteId: "site-a" },
    participantId: "p2",
    participant: { school: "Escuela A" },
    results: [{ calculatedScore: 1, maxPossible: 1 }],
  },
]);

assert.equal(result.totalGroups, 1);
assert.equal(result.rows[0]!.studentsResponded, 2);
assert.equal(result.rows[0]!.cqsCount, 1);
assert.equal(result.rows[0]!.improvementPercent, 30);

console.log("✓ survey-group-search self-check passed");

assert.equal(result.rows[0]!.expectedParticipants, 1);
assert.equal(result.rows[0]!.preResponsePercent, 100);
assert.equal(result.rows[0]!.postResponsePercent, 100);
assert.equal(result.rows[0]!.cqsResponsePercent, 100);
const responseRows = (moments: ("PRE" | "POST" | "CQS" | "POST_POST" | "UNKNOWN")[]) => summarizeGroupSearchRows(moments.map((surveyMoment, i) => ({
  reviewExcluded: false,
  status: "PROCESADO" as const,
  receivedAt: new Date("2026-01-10T10:00:00Z"), surveyMoment,
  surveyDefinition: { siteId: "site-a" },
  participantId: `participant-${i}`, participant: { school: "Response test" }, results: [],
}))).rows[0]!;
const partial = responseRows(["PRE", "PRE", "PRE", "POST", "CQS", "CQS", "POST_POST", "UNKNOWN"]);
assert.equal(partial.expectedParticipants, 3);
assert.equal(partial.postResponsePercent, 33.3);
assert.equal(partial.cqsResponsePercent, 66.7);
assert.equal(partial.improvementPercent, null);
const noPre = responseRows(["POST", "CQS"]);
assert.equal(noPre.expectedParticipants, 0);
assert.equal(noPre.preResponsePercent, null);
assert.equal(noPre.postResponsePercent, null);
assert.equal(noPre.cqsResponsePercent, null);
assert.equal(responseRows(["PRE"]).postResponsePercent, 0);
assert.equal(responseRows(["PRE", "POST", "POST"]).postResponsePercent, 200);
assert.deepEqual(summarizeGroupSearchRows([]), { totalGroups: 0, rows: [] });

const sameSchool = { reviewExcluded: false, status: "PROCESADO" as const, receivedAt: new Date("2026-01-10T12:00:00Z"), participantId: "same-participant", participant: { school: "Same school" }, results: [] };
const separateSites = summarizeGroupSearchRows([
  { ...sameSchool, surveyDefinition: { siteId: "a" }, surveyMoment: "PRE" },
  { ...sameSchool, surveyDefinition: { siteId: "b" }, surveyMoment: "POST" },
]);
assert.equal(separateSites.totalGroups, 2);
assert.equal(separateSites.rows.find((row) => row.siteId === "a")!.postCount, 0);
assert.equal(separateSites.rows.find((row) => row.siteId === "b")!.preCount, 0);
assert(separateSites.rows.every((row) => row.improvementPercent === null));
const sorted = summarizeGroupSearchRows([
  { ...sameSchool, surveyDefinition: { siteId: "a" }, surveyMoment: "PRE" },
  { ...sameSchool, receivedAt: new Date("2026-02-10T12:00:00Z"), surveyDefinition: { siteId: "a" }, surveyMoment: "PRE" },
]);
assert.deepEqual(sorted.rows.map((row) => row.date), ["2026-02-10", "2026-01-10"]);

for (const input of [{ from: "not-a-date" }, { to: "2026-02-29" }, { from: "2026-13-01" }, { from: "2026-02-30" }, { to: "2026-01-01T12:00:00Z" }, { from: "2026-02-02", to: "2026-02-01" }, { siteId: "bad" }, { surveyDefinitionId: "bad" }]) {
  assert.equal(SurveyGroupSearchSchema.safeParse(input).success, false);
}
for (const input of [{}, { from: "2024-02-29" }, { to: "2026-12-31" }, { from: "2026-01-01", to: "2026-01-01" }]) {
  assert.equal(SurveyGroupSearchSchema.safeParse(input).success, true);
}

const manual = summarizeGroupSearchRows([
  { ...sameSchool, surveyDefinition: { siteId: "a" }, surveyMoment: "POST" },
], [{ siteId: "a", school: "Same school", date: "2026-01-10", expectedParticipants: 4 }]).rows[0]!;
assert.equal(manual.manualExpectedParticipants, 4);
assert.equal(manual.expectedParticipants, 4);
assert.equal(manual.preResponsePercent, 0);
assert.equal(manual.postResponsePercent, 25);
assert.equal(manual.cqsResponsePercent, 0);

const expectationKey = { siteId: "00000000-0000-4000-8000-000000000001", school: "School", date: "2026-06-01" };
for (const expectedParticipants of [0, -1, 1.5, 1000001, "4"]) assert.equal(CourseExpectationSchema.safeParse({ ...expectationKey, expectedParticipants }).success, false);
for (const expectedParticipants of [null, 1, 1000000]) assert.equal(CourseExpectationSchema.safeParse({ ...expectationKey, expectedParticipants }).success, true);

const needsReview = summarizeGroupSearchRows([
  { ...sameSchool, status: "ERROR", surveyDefinition: { siteId: "a" }, surveyMoment: "PRE", results: [{ calculatedScore: 10, maxPossible: 10 }] },
  { ...sameSchool, status: "PENDIENTE_CONFIGURACION", surveyDefinition: { siteId: "a" }, surveyMoment: "POST" },
]);
assert.equal(needsReview.totalGroups, 1);
assert.equal(needsReview.rows[0]!.pendingCount, 1);
assert.equal(needsReview.rows[0]!.errorCount, 1);
assert.equal(needsReview.rows[0]!.preCount, 0);
assert.equal(needsReview.rows[0]!.postCount, 0);
assert.equal(needsReview.rows[0]!.studentsResponded, 0);
assert.equal(needsReview.rows[0]!.improvementPercent, null);
assert.equal(needsReview.rows[0]!.preResponsePercent, null);

const excluded = summarizeGroupSearchRows([{ ...sameSchool, reviewExcluded: true, surveyDefinition: { siteId: "a" }, surveyMoment: "PRE" }]).rows[0]!;
assert.equal(excluded.excludedCount, 1);
assert.equal(excluded.preCount, 0);
assert.equal(excluded.studentsResponded, 0);

for (const moment of ["PRE", "POST", "CQS", "POST_POST", null]) assert.equal(SubmissionMomentReviewSchema.safeParse({ moment }).success, true);
for (const moment of ["UNKNOWN", "", 1, undefined]) assert.equal(SubmissionMomentReviewSchema.safeParse({ moment }).success, false);

const coverage = (counts: [number, number, number], expected: number) => summarizeGroupSearchRows(
  (["PRE", "POST", "CQS"] as const).flatMap((surveyMoment, index) => Array.from({ length: counts[index]! }, (_, i) => ({ ...sameSchool, participantId: `${surveyMoment}-${i}`, surveyDefinition: { siteId: "a" }, surveyMoment }))),
  [{ siteId: "a", school: "Same school", date: "2026-01-10", expectedParticipants: expected }],
).rows[0]!;
assert.equal(coverage([80, 80, 80], 100).meetsResponseCoverage, true);
for (const counts of [[79, 80, 80], [80, 79, 80], [80, 80, 79]] as [number, number, number][]) assert.equal(coverage(counts, 100).meetsResponseCoverage, false);
assert.equal(coverage([101, 100, 100], 100).meetsResponseCoverage, true);
assert.equal(noPre.meetsResponseCoverage, false);
assert.equal(coverage([4, 4, 4], 5).meetsResponseCoverage, true);
assert.equal(coverage([4, 4, 4], 6).meetsResponseCoverage, false);
const roundedCoverage = coverage([1600, 1600, 1599], 2000);
assert.equal(roundedCoverage.cqsResponsePercent, 80);
assert.equal(roundedCoverage.meetsResponseCoverage, false);

const dated = (day: string, moment: "PRE" | "POST", school = "Escuela A") => ({
  reviewExcluded: false, status: "PROCESADO" as const, receivedAt: new Date(day + "T12:00:00Z"),
  surveyMoment: moment, surveyDefinition: { id: "instrument-a", siteId: "site-a", configurationVersion: 4 },
  participantId: null, participant: { school }, results: [],
  rawJsonData: { created_at: day + " 12:00:00" },
});

const daily = summarizeGroupSearchRows([dated("2026-08-28", "PRE"), dated("2026-08-30", "POST")], [], true);
assert.equal(daily.totalGroups, 2);
assert.equal(daily.rows[0]?.date, "2026-08-30");
const schools = summarizeGroupSearchRows([
  dated("2026-08-28", "PRE", "Escuela B"),
  dated("2026-08-28", "PRE", "Escuela A"),
  dated("2026-08-28", "PRE", "Escuela A"),
], [], true);
assert.equal(schools.totalGroups, 1);
assert.equal(schools.rows[0]?.school, "Escuela A, Escuela B");
assert.equal(schools.rows[0]?.preCount, 3);
assert.equal(schools.rows[0]?.contextNeedsReview, true);
