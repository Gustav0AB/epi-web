import assert from "node:assert";
import { summarizeGroupSearchRows } from "./surveys.service.js";

const result = summarizeGroupSearchRows([
  {
    receivedAt: new Date("2026-01-10T10:00:00Z"),
    surveyMoment: "PRE",
    participantId: "p1",
    participant: { school: "Escuela A" },
    results: [{ calculatedScore: 5, maxPossible: 10 }],
  },
  {
    receivedAt: new Date("2026-01-10T12:00:00Z"),
    surveyMoment: "POST",
    participantId: "p1",
    participant: { school: "Escuela A" },
    results: [{ calculatedScore: 8, maxPossible: 10 }],
  },
  {
    receivedAt: new Date("2026-01-10T13:00:00Z"),
    surveyMoment: "CQS",
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
