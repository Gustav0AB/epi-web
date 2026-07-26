// Auto-check del filtro combinado sitio+exclusión de encuestas. Correr:
// tsx src/modules/surveys/surveys.repository.selfcheck.ts
import assert from "node:assert";
import { scopeToDefinitionWhere } from "./surveys.repository.js";

// Sin scope: sin filtro.
assert.strictEqual(scopeToDefinitionWhere(undefined), undefined);

// Solo sitios permitidos.
assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1", "s2"] }), { siteId: { in: ["s1", "s2"] } });

// Sitios + encuestas excluidas: ambos filtros se combinan (AND implícito).
assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1"], excludedSurveyDefinitionIds: ["d1"] }), {
  siteId: { in: ["s1"] },
  id: { notIn: ["d1"] },
});

// excludedSurveyDefinitionIds vacío no agrega filtro.
assert.deepStrictEqual(scopeToDefinitionWhere({ siteIds: ["s1"], excludedSurveyDefinitionIds: [] }), {
  siteId: { in: ["s1"] },
});

console.log("✓ surveys.repository self-check passed");
