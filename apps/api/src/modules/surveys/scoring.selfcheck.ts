import assert from "node:assert";
import { scoreAnswer, aggregate } from "./scoring.js";

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

console.log("✓ scoring self-check passed");
