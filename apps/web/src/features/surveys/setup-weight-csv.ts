import { parseCsv, WeightInputSchema, type SurveySetupQuestion, type WeightInput } from "@epi/shared";

type Question = SurveySetupQuestion & { options: string[] };
export type WeightCsvError = "duplicate" | "unknown" | "notScored" | "invalidWeight" | "invalidAnswer";
export type WeightCsvRow = { row: number; externalId: string; weight: WeightInput | null; error: WeightCsvError | null };

export function previewSetupWeights(csv: string, questions: Question[]): WeightCsvRow[] {
  const rows = parseCsv(csv, { strict: true, requiredHeaders: ["externalId", "category", "maxScore"] });
  if (rows.length > 500) throw new Error("CSV accepts at most 500 rows");
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.externalId!, (counts.get(row.externalId!) ?? 0) + 1);
  const byId = new Map(questions.map((question) => [question.externalId, question]));
  return rows.map((row, index) => {
    const externalId = row.externalId!;
    const question = byId.get(externalId);
    const parsed = WeightInputSchema.safeParse(row);
    let error: WeightCsvError | null = null;
    if ((counts.get(externalId) ?? 0) > 1) error = "duplicate";
    else if (!question) error = "unknown";
    else if ((question.role ?? "SCORED") !== "SCORED" || question.type === "OPEN_TEXT") error = "notScored";
    else if (!parsed.success || parsed.data.category.length > 200) error = "invalidWeight";
    else if (question.type === "ONE_ANSWER" && (!parsed.data.correctAnswer || (question.options.length > 0 && !question.options.includes(parsed.data.correctAnswer)))) error = "invalidAnswer";
    return { row: index + 2, externalId, weight: !error && parsed.success ? parsed.data : null, error };
  });
}

export function applySetupWeightRows(edits: SurveySetupQuestion[], questions: Question[], rows: { externalId: string; weight: WeightInput }[]): SurveySetupQuestion[] {
  const weights = new Map(rows.map((row) => [row.externalId, row.weight]));
  const patches = questions.filter((question) => weights.has(question.externalId)).map((question) => {
    const weight = weights.get(question.externalId)!;
    return { ...question, weight: { ...weight, ...(weight.factor === undefined && question.weight?.factor !== undefined ? { factor: question.weight.factor } : {}) } };
  });
  return [...edits.filter((question) => !weights.has(question.externalId)), ...patches];
}
