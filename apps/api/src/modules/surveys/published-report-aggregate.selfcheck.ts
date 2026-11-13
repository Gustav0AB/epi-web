import assert from "node:assert/strict";
import type { CourseResultsDto, PrePostBase } from "@epi/shared";
import { aggregatePublishedCourses } from "./published-report-aggregate.js";

const base = (points: number, maximum: number): PrePostBase => ({
  valid: maximum, blank: 0, nonScorable: 0, invalid: 0, configurationPending: 0,
  zeroMaximum: 0, points, applicableMaximum: maximum,
});
const course = (pre: PrePostBase, post: PrePostBase): CourseResultsDto => ({
  courseId: "course", name: "Curso", school: "Escuela", siteId: "site", activity: "Actividad",
  revision: 1, calculatedAt: "2026-11-01T00:00:00Z", methodology: "approved_pre_post_v1",
  primaryDefinitionId: "definition", coverageThreshold: 80, expectedParticipants: 4,
  expectedParticipantsPre: 4, expectedParticipantsPost: 4, preReceipts: pre.valid, postReceipts: post.valid,
  excludedReceipts: 0, contextPendingReceipts: 0, sourcePendingReceipts: 0, complementaryReceipts: 0,
  unsupportedVersionReceipts: 0, categorySelection: { included: ["A"], excluded: [] },
  distributions: [{ definitionId: "definition", instrument: "Instrumento", version: 1,
    categoryWeights: [{ category: "A", weight: 100 }],
    subcategoryWeights: [{ category: "A", subcategory: "B", weight: 100 }] }],
  questions: [{ id: "q", definitionId: "definition", instrument: "Instrumento", version: 1,
    text: "Pregunta", category: "A", subcategory: "B", factor: 1, maximum: 1,
    configurationReady: true, rule: "Respuesta correcta", options: [], pre, post }],
  aggregates: [], groups: [], pending: [],
});
const first = course(base(1, 1), base(1, 1));
const second = course(base(0, 3), base(2, 3));
const report = aggregatePublishedCourses([first, second]);
assert.equal(report.data.series.categoryComparison?.[0]?.pre, 25);
assert.equal(report.data.series.categoryComparison?.[0]?.post, 75);
assert.equal(report.data.kpis.overallImprovement, 200);
assert.throws(() => aggregatePublishedCourses([{ ...first, categorySelection: { included: ["C"], excluded: [] } }, second]), /categorías/);
assert.throws(() => aggregatePublishedCourses([{ ...first, primaryDefinitionId: "otro" }, second]), /configuraciones/);
assert.throws(() => aggregatePublishedCourses([{ ...first, questions: first.questions.map(q => ({ ...q, factor: 2 })) }, second]), /configuraciones/);
console.log("Agregación de publicaciones verificada");
