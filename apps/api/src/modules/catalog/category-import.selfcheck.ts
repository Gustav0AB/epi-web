import assert from "node:assert/strict";
import { previewCategoryRows } from "./category-import.js";

const existing = [{ name: "Learning", subcategory: "Skills" }, { name: "Inactive", subcategory: null }];
const original = structuredClone(existing);
const result = previewCategoryRows('category,subcategory\n Learning , Skills \nNew,Topic\nNew,Topic\nInactive,\n,Missing\nlearning,Skills\n"Ocean, life",\n' + 'x'.repeat(101) + ',Topic', existing);
assert.deepEqual(result.additions, [
  { row: 3, category: "New", subcategory: "Topic" },
  { row: 7, category: "learning", subcategory: "Skills" },
  { row: 8, category: "Ocean, life", subcategory: null },
]);
assert.deepEqual(result.duplicates.map((row) => row.row), [2, 4, 5]);
assert.deepEqual(result.errors.map((row) => row.row), [6, 9]);
assert.deepEqual(existing, original);
assert.deepEqual(previewCategoryRows('category,subcategory', existing), { additions: [], duplicates: [], errors: [] });
for (const csv of ['name,subcategory\nA,B', 'category,subcategory\n"Unclosed,B', 'category,category\nA,B', 'category,subcategory\nA,B,C']) {
  assert.throws(() => previewCategoryRows(csv, existing));
}
const committed = [...existing, ...result.additions.map((row) => ({ name: row.category, subcategory: row.subcategory }))];
assert.equal(previewCategoryRows('category,subcategory\nNew,Topic', committed).additions.length, 0);
assert.equal(previewCategoryRows('category,subcategory\nNew,Topic', []).additions.length, 1);
console.log("✓ category import preview, validation, duplicates and additive behavior passed");
