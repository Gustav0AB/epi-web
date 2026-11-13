import assert from "node:assert";
import { ReportFiltersSchema, PublishCourseSchema } from "@epi/shared";
import { scoreAnswer, aggregate, overallImprovement, categoryQuestionResults } from "./scoring.js";
import { makeDetailRow } from "./surveys.service.js";

assert.equal(scoreAnswer({ type: "ONE_ANSWER", value: "B", maxScore: 10, correctAnswer: "B" }), 10);
assert.equal(scoreAnswer({ type: "ONE_ANSWER", value: "A", maxScore: 10, correctAnswer: "B" }), 0);

assert.equal(scoreAnswer({ type: "LIKERT", value: "4", maxScore: 5 }), 4);
assert.equal(scoreAnswer({ type: "LIKERT", value: "9", maxScore: 5 }), 5);
assert.equal(scoreAnswer({ type: "FREQUENCY", value: "x", maxScore: 5 }), 0);

const agg = aggregate([
  { category: "salud", subcategory: "mental", score: 3, max: 5 },
  { category: "salud", subcategory: "mental", score: 2, max: 5 },
  { category: "salud", subcategory: null, score: 4, max: 10 },
]);
assert.equal(agg.length, 2);
assert.equal(agg.find((r) => r.subcategory === "mental")!.score, 5);
assert.equal(agg.find((r) => r.subcategory === "mental")!.max, 10);
assert.equal(agg.find((r) => r.subcategory === null)!.score, 4);
assert.equal(agg.find((r) => r.subcategory === null)!.max, 10);


const emptyDetail = { category: "Total", subcategory: null, pre: null, post: null, change: null };
assert.deepEqual(makeDetailRow("Total", []), emptyDetail);
assert.deepEqual(makeDetailRow("Total", [{ pre: true, score: 0, max: 0 }, { pre: false, score: 0, max: 0 }]), emptyDetail);
assert.deepEqual(makeDetailRow("Total", [
  { pre: true, score: 0, max: 0 },
  { pre: true, score: 3, max: 5 },
  { pre: false, score: 0, max: 0 },
  { pre: false, score: 4, max: 5 },
]), { category: "Total", subcategory: null, pre: 60, post: 80, change: 33.3 });
assert.equal(makeDetailRow("Total", [{ pre: true, score: 0, max: 5 }]).pre, 0);

console.log("scoring self-check passed");

const excludedId = "00000000-0000-4000-8000-000000000001";
assert.deepEqual(ReportFiltersSchema.parse({ excludedQuestionIds: excludedId }).excludedQuestionIds, [excludedId]);
assert.deepEqual(ReportFiltersSchema.parse({ excludedQuestionIds: [excludedId] }).excludedQuestionIds, [excludedId]);
assert.equal(ReportFiltersSchema.safeParse({ excludedQuestionIds: "invalid" }).success, false);
assert.equal(ReportFiltersSchema.safeParse({ excludedQuestionIds: Array(201).fill(excludedId) }).success, false);

assert.equal(ReportFiltersSchema.safeParse({ courseDate: "2026-06-01" }).success, false);
assert.equal(ReportFiltersSchema.safeParse({ courseDate: "2026-02-30", siteId: excludedId, school: "School" }).success, false);
assert.equal(ReportFiltersSchema.parse({ courseDate: "2026-06-01", siteId: excludedId, school: " School " }).school, "School");

assert.equal(overallImprovement([]), null);
assert.equal(overallImprovement([{ pre: 40, post: null, excluded: false }, { pre: null, post: 80, excluded: false }]), null);
const comparableQuestions = [{ pre: 20, post: 80, excluded: false }, { pre: 90, post: 60, excluded: false }, { pre: 0, post: 100, excluded: true }];
assert.equal(overallImprovement(comparableQuestions), 27.3);
assert.equal(overallImprovement(comparableQuestions.map(q => ({ ...q, excluded: true }))), null);
assert.equal(overallImprovement([{ pre: 80, post: 20, excluded: false }]), -75);
assert.equal(overallImprovement([{ pre: 0, post: 0, excluded: false }]), null);
assert.equal(overallImprovement([{ pre: 0, post: 10, excluded: false }, { pre: 0, post: 0, excluded: false }, { pre: 0, post: 0, excluded: false }]), null);

const categoryQuestion = (pre: number | null, post: number | null, excluded = false) => ({ category: "Learning", subcategory: null, pre, post, excluded });
assert.deepEqual(categoryQuestionResults([categoryQuestion(30, 80), categoryQuestion(20, 80)]), [{ category: "Learning", subcategory: null, pre: 25, post: 80, change: 220 }]);
assert.deepEqual(categoryQuestionResults([categoryQuestion(30, null), categoryQuestion(null, 80)])[0], { category: "Learning", subcategory: null, pre: 30, post: 80, change: null });
assert.equal(categoryQuestionResults([categoryQuestion(30, 80), categoryQuestion(0, 100, true)])[0]!.change, 166.7);
assert.deepEqual(categoryQuestionResults([categoryQuestion(null, null), categoryQuestion(0, 100, true)]), []);
assert.equal(categoryQuestionResults([{ ...categoryQuestion(0, 10), category: "A||B" }, { ...categoryQuestion(0, 20), category: "A", subcategory: "B||" }]).length, 2);

const publishKey = { siteId: excludedId, school: "School", date: "2026-08-01", expectedVersion: 0 };
assert.deepEqual(PublishCourseSchema.parse(publishKey).excludedQuestionIds, []);
assert.equal(PublishCourseSchema.safeParse({ ...publishKey, expectedVersion: -1 }).success, false);
assert.equal(PublishCourseSchema.safeParse({ ...publishKey, expectedVersion: 0.5 }).success, false);
assert.equal(PublishCourseSchema.safeParse({ ...publishKey, excludedQuestionIds: ["bad"] }).success, false);
