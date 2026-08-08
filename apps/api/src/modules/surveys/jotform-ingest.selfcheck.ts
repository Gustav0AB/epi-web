import assert from "node:assert";
import { normalizeJotform } from "./surveys.service.js";

const flatRawRequest = {
  q3_dropdown1: "Grupo 1",
  q4_dropdown2: "Grado 1",
  q5_number3: "20",
  q6_radio4: "Local",
  q7_radio5: "Masculino",
  q8_textarea6: "test",
  slug: "some-slug",
};

const webhookBody = {
  formID: "262046014002034",
  submissionID: "6607335351011958939",
  rawRequest: JSON.stringify(flatRawRequest),
};

const normalizedWebhook = normalizeJotform(webhookBody) as {
  formID: string;
  submissionID: string;
  answers: { questionId: string; value: unknown }[];
};

assert.strictEqual(normalizedWebhook.formID, "262046014002034");
assert.strictEqual(normalizedWebhook.submissionID, "6607335351011958939");
assert.strictEqual(normalizedWebhook.answers.length, 6, "slug no debe convertirse en respuesta");
assert.deepStrictEqual(
  normalizedWebhook.answers.find((a) => a.questionId === "q3_dropdown1"),
  { questionId: "q3_dropdown1", value: "Grupo 1" }
);
assert.ok(!normalizedWebhook.answers.some((a) => a.questionId === "slug"));

const submissionsApiBody = {
  id: "6607335351011958939",
  form_id: "262046014002034",
  answers: {
    "3": { name: "q3_dropdown1", order: "3", text: "Grupo", type: "control_dropdown", answer: "Grupo 1" },
    "4": { name: "q4_dropdown2", order: "4", text: "Grado", type: "control_dropdown", answer: "Grado 1" },
    "5": { name: "q5_number3", order: "5", text: "Edad", type: "control_number", answer: "20" },
    "12": { name: "q12_collapse10", order: "12", text: "Actividad de exploración", type: "control_collapse" },
    "17": { name: "q17_submit", order: "17", text: "Enviar", type: "control_button" },
  },
};

const normalizedApi = normalizeJotform(submissionsApiBody) as {
  formID: string;
  submissionID: string;
  answers: { questionId: string; value: unknown }[];
};

assert.strictEqual(normalizedApi.formID, "262046014002034");
assert.strictEqual(normalizedApi.submissionID, "6607335351011958939");
assert.strictEqual(normalizedApi.answers.length, 3, "control_collapse/control_button sin 'answer' se descartan");
assert.deepStrictEqual(
  normalizedApi.answers.find((a) => a.questionId === "q5_number3"),
  { questionId: "q5_number3", value: "20" }
);

console.log("✓ jotform-ingest (normalizeJotform) self-check passed");
