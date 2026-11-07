import { csvCell, WEIGHT_CSV_COLUMNS, type SurveySetupQuestion } from "@epi/shared";

type ExportQuestion = {
  externalId: string;
  text: string;
  type: string;
  role?: SurveySetupQuestion["role"];
  weight?: SurveySetupQuestion["weight"];
};

export function exportWeightCsv(questions: ExportQuestion[], scaleMax?: number): string {
  const rows = questions.filter((q) => (q.role ?? "SCORED") === "SCORED" && q.type !== "OPEN_TEXT").map((q) => [
    q.externalId, q.text, q.type, q.weight?.category ?? "", q.weight?.subcategory ?? "",
    q.weight?.maxScore ?? (scaleMax !== undefined && (q.type === "LIKERT" || q.type === "FREQUENCY") ? scaleMax : ""),
    q.weight?.correctAnswer ?? "", q.weight?.factor ?? 1,
  ].map(csvCell).join(","));
  return [WEIGHT_CSV_COLUMNS.join(","), ...rows].join("\n");
}
