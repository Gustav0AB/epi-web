import { WeightInputSchema, type QuestionWithWeight, type SurveySetupQuestion, type WeightInput } from "@epi/shared";

type Question = SurveySetupQuestion & { options: string[] };
export type ReusedWeight = { externalId: string; text: string; sourceId: string | null; weight: WeightInput | null; status: "ready" | "existing" | "unmatched" | "ambiguous" | "invalid" };
const normalizedText = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

export function previewReusedWeights(targets: Question[], sources: QuestionWithWeight[]): ReusedWeight[] {
  return targets.filter((target) => (target.role ?? "SCORED") === "SCORED" && target.type !== "OPEN_TEXT").map((target) => {
    const row: ReusedWeight = { externalId: target.externalId, text: target.text, sourceId: null, weight: null, status: "unmatched" };
    if (target.weight && (target.weight.maxScore !== null || target.weight.correctAnswer)) return { ...row, status: "existing" };
    const options = JSON.stringify([...target.options].sort());
    const matches = sources.filter((source) => source.weight && (source.role ?? "SCORED") === "SCORED" && source.type === target.type && normalizedText(source.text) === normalizedText(target.text) && JSON.stringify([...source.options].sort()) === options);
    if (!matches.length) return row;
    if (matches.length > 1) return { ...row, status: "ambiguous" };
    const source = matches[0]!;
    const parsed = WeightInputSchema.safeParse(source.weight);
    if (!parsed.success || parsed.data.category.length > 200 || (target.type === "ONE_ANSWER" && (!parsed.data.correctAnswer || (target.options.length > 0 && !target.options.includes(parsed.data.correctAnswer))))) return { ...row, status: "invalid" };
    return { ...row, sourceId: source.externalId, weight: parsed.data, status: "ready" };
  });
}
