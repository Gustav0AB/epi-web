import assert from "node:assert";
import { liftIdentifiers, normalizeJotform } from "./surveys.service.js";

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

const cqsBody = {
  formID: "form-cqs",
  submissionID: "sub-cqs",
  answers: [{ questionId: "momento", value: "Satisfacción" }],
};

assert.strictEqual((liftIdentifiers(cqsBody) as typeof cqsBody & { surveyMoment: string }).surveyMoment, "CQS");

console.log("✓ jotform-ingest (normalizeJotform) self-check passed");

const { schoolContext } = await import("./school-context.js");
assert.deepStrictEqual(schoolContext("  10/10/2026 - CBTIS   62  "), { original: "  10/10/2026 - CBTIS   62  ", school: "CBTIS 62", extractedDate: "2026-10-10", needsReview: false });
assert.strictEqual(schoolContext("29/02/2024 - School")?.extractedDate, "2024-02-29");
for (const text of ["29/02/2025 - School", "31/04/2026 - School", "10/10/2026 - ", "2026-10-10 - School", "1/2/26 - School"]) {
  assert.strictEqual(schoolContext(text)?.needsReview, true);
  assert.strictEqual(schoolContext(text)?.extractedDate, null);
}
assert.strictEqual(schoolContext("CBTIS 230")?.school, "CBTIS 230");
assert.strictEqual(schoolContext("CBTIS 230")?.extractedDate, null);
for (const value of [null, undefined, "  ", 230, { school: "School" }]) assert.strictEqual(schoolContext(value), null);
const schoolValue = "15/10/2026 - CBTIS 62";
const fromWebhook = liftIdentifiers(normalizeJotform({ formID: "school", submissionID: "1", rawRequest: JSON.stringify({ escuela: schoolValue }) })) as any;
const fromHistory = liftIdentifiers(normalizeJotform({ form_id: "school", id: "1", answers: { "1": { name: "escuela", answer: schoolValue } } })) as any;
assert.deepStrictEqual(fromWebhook.schoolContext, fromHistory.schoolContext);
assert.strictEqual(fromWebhook.schoolContext.school, "CBTIS 62");
assert.strictEqual(fromWebhook.participant, undefined, "School context must not require or invent a participant ID");
assert.strictEqual(fromWebhook.answers[0].value, schoolValue);
assert.deepStrictEqual((liftIdentifiers(fromWebhook) as any).schoolContext, fromWebhook.schoolContext);

const { configuredSchoolContext } = await import("./school-context.js");
const schoolFields = [{ externalId: "q99_custom", role: "SCHOOL_GROUP" }];
assert.strictEqual(configuredSchoolContext([{ questionId: "q99_custom", value: "10/10/2026 - CBTIS 62" }], schoolFields)?.school, "CBTIS 62");
assert.strictEqual(configuredSchoolContext([{ questionId: "q99_custom", value: { other: " Otra escuela " } }], schoolFields)?.school, "Otra escuela");
assert.strictEqual(configuredSchoolContext([], []) , undefined);
for (const answers of [[], [{ questionId: "escuela", value: "Wrong fallback" }], [{ questionId: "q99_custom", value: [] }], [{ questionId: "q99_custom", value: "A" }, { questionId: "q99_custom", value: "B" }]]) {
  assert.strictEqual(configuredSchoolContext(answers, schoolFields)?.needsReview, true);
}
assert.strictEqual(configuredSchoolContext([], [...schoolFields, ...schoolFields])?.needsReview, true);

const { schoolGroupingContext } = await import("./school-context.js");
const plainSchool = schoolContext("CBTIS 62")!;
const localDate = schoolGroupingContext(plainSchool, "2026-11-04T02:00:00Z", "America/Mazatlan");
assert.strictEqual(localDate.groupingDate, "2026-11-03");
assert.strictEqual(localDate.dateSource, "submitted_at");
assert.strictEqual(localDate.originalSubmittedAt, "2026-11-04T02:00:00Z");
assert.strictEqual(schoolGroupingContext(plainSchool, "2026-11-04T02:00:00+00:00", "UTC").groupingDate, "2026-11-04");
assert.strictEqual(schoolGroupingContext(plainSchool, "2026-11-04 02:00:00", null).groupingDate, "2026-11-04");
assert.strictEqual(schoolGroupingContext(plainSchool, "2026-11-04T23:59:59-07:00", null).groupingDate, "2026-11-04");
const preferredDate = schoolGroupingContext(schoolContext("10/10/2026 - CBTIS 62")!, "2026-11-04T02:00:00Z", "UTC");
assert.strictEqual(preferredDate.groupingDate, "2026-10-10");
assert.strictEqual(preferredDate.dateSource, "school_field");
for (const [timestamp, zone] of [["2026-11-04 02:00:00", "UTC"], [undefined, "UTC"], ["2026-02-30T02:00:00Z", "UTC"], ["2026-02-30T02:00:00Z", null], ["2026-11-04T02:00:00Z", "Invalid/Zone"]] as const) {
  assert.strictEqual(schoolGroupingContext(plainSchool, timestamp, zone).needsReview, true);
  assert.strictEqual(schoolGroupingContext(plainSchool, timestamp, zone).groupingDate, null);
}
assert.strictEqual(schoolGroupingContext(schoolContext("31/04/2026 - School")!, "2026-11-04T02:00:00Z", "UTC").groupingDate, null);
assert.strictEqual((normalizeJotform({ ...submissionsApiBody, created_at: "2026-11-04 02:00:00" }) as any).created_at, "2026-11-04 02:00:00");

const { configuredActivityContext } = await import("./activity-context.js");
const activityFields = [{ externalId: "customActivity", role: "ACTIVITY" }];
assert.deepStrictEqual(configuredActivityContext([{ questionId: "customActivity", value: "  Rancho   Cacachilas  " }], activityFields), { original: "  Rancho   Cacachilas  ", activity: "Rancho Cacachilas", needsReview: false });
assert.strictEqual(configuredActivityContext([], []), undefined);
for (const answers of [[], [{ questionId: "customActivity", value: " " }], [{ questionId: "customActivity", value: ["A", "B"] }], [{ questionId: "customActivity", value: "A" }, { questionId: "customActivity", value: "B" }], [{ questionId: "activity", value: "Wrong fallback" }]]) assert.strictEqual(configuredActivityContext(answers, activityFields)?.needsReview, true);
assert.strictEqual(configuredActivityContext([], [...activityFields, ...activityFields])?.needsReview, true);


const structuredValues = { matrix: { rowA: "Agree", rowB: [1, null, false] }, choices: ["A", "B"], consent: false, blank: null, score: 0 };
const structuredWebhook = normalizeJotform({ formID: "structured", submissionID: "s", rawRequest: JSON.stringify(structuredValues) });
const structuredApi = normalizeJotform({ form_id: "structured", id: "s", answers: Object.fromEntries(Object.entries(structuredValues).map(([name, answer], index) => [index, { name, answer }])) });
const { JotformPayloadSchema, AnswerJsonSchema } = await import("./surveys.schema.js");
assert.deepStrictEqual(JotformPayloadSchema.parse(structuredWebhook).answers, JotformPayloadSchema.parse(structuredApi).answers);
assert.deepStrictEqual(Object.fromEntries(JotformPayloadSchema.parse(structuredApi).answers.map(answer => [answer.questionId, answer.value])), structuredValues);
for (const invalid of [undefined, NaN, Infinity, { nested: undefined }, [NaN]]) assert.equal(AnswerJsonSchema.safeParse(invalid).success, false);
console.log("✓ structured answers and nulls preserved equally for webhook and API");

const ambiguousId = JotformPayloadSchema.parse(liftIdentifiers({ formID: "f", submissionID: "s", answers: [{ questionId: "participantId", value: { id: "ambiguous" } }] }));
assert.equal(ambiguousId.participant, undefined, "Objects must not become [object Object] participant identifiers");

assert.equal(JotformPayloadSchema.parse(liftIdentifiers({ formID: "f", submissionID: "s", answers: [{ questionId: "participantId", value: false }] })).participant, undefined);


const sourceWithUnknown = {
  "1": { name: "known", answer: 0, type: "control_scale", text: "Score" },
  "2": { answer: { row: "A" }, type: "control_matrix", text: "Unknown name" },
  "3": { name: "", answer: null },
  "4": { name: "repeat", answer: "A" },
  "5": { name: "repeat", answer: "B" },
  "6": { type: "control_head", text: "Heading" },
  "7": null,
};
const preserved = JotformPayloadSchema.parse(normalizeJotform({ form_id: "f", id: "s", answers: sourceWithUnknown }));
assert.deepStrictEqual(preserved.sourceAnswers, sourceWithUnknown);
assert.deepStrictEqual(preserved.answers, [{ questionId: "known", value: 0 }]);
assert.deepStrictEqual(preserved.unresolvedAnswers, [
  { sourceId: "2", reason: "MISSING_NAME" }, { sourceId: "3", reason: "MISSING_NAME" },
  { sourceId: "7", reason: "INVALID_ENTRY" }, { sourceId: "4", reason: "DUPLICATE_NAME" }, { sourceId: "5", reason: "DUPLICATE_NAME" },
]);
assert.equal(JotformPayloadSchema.parse(normalizeJotform({ form_id: "f", id: "s", answers: { header: { type: "control_head" } } })).unresolvedAnswers, undefined);
console.log("✓ source metadata and unresolved answers preserved without guessed identifiers");
