import assert from "node:assert";
import { scopeToDefinitionWhere } from "./surveys.repository.js";

assert.strictEqual(scopeToDefinitionWhere(undefined), undefined);

assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1", "s2"] }), { siteId: { in: ["s1", "s2"] } });

assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1"], excludedSurveyDefinitionIds: ["d1"] }), {
  siteId: { in: ["s1"] },
  id: { notIn: ["d1"] },
});

assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1"], excludedSurveyDefinitionIds: [] }), {
  siteId: { in: ["s1"] },
});

console.log("✓ surveys.repository self-check passed");
