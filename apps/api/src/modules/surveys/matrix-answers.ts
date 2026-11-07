import { QuestionSourceContextSchema } from "@epi/shared";
import type { AnswerJson } from "./surveys.schema.js";

type Answer = { questionId: string; value: AnswerJson };
// Only labelled row objects are unambiguous; other formats stay in the original payload.
export function expandMatrixAnswers(answers: Answer[], questions: { externalId: string; sourceContext?: unknown }[]) {
  const expanded = [...answers];
  const warnings: string[] = [];
  for (const question of questions) {
    const context = QuestionSourceContextSchema.safeParse(question.sourceContext);
    const matrix = context.success ? context.data.matrix : undefined;
    if (!matrix) continue;
    const parents = answers.filter(answer => answer.questionId === matrix.externalId);
    if (!parents.length) continue;
    const value = parents[0]!.value;
    if (parents.length !== 1 || value === null || typeof value !== "object" || Array.isArray(value) || expanded.some(answer => answer.questionId === question.externalId)) {
      warnings.push(`Respuesta de matriz ambigua: ${matrix.text}`); continue;
    }
    if (Object.prototype.hasOwnProperty.call(value, matrix.rowLabel)) expanded.push({ questionId: question.externalId, value: value[matrix.rowLabel]! });
  }
  return { answers: expanded, warnings: [...new Set(warnings)] };
}
