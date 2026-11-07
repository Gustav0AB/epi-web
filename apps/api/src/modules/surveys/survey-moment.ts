import { MomentMappingSchema, type SurveyMoment } from "@epi/shared";
import type { JotformPayload } from "./surveys.schema.js";

export function resolveSurveyMoment(payload: JotformPayload, questions: { externalId: string; role?: string; momentMappings?: unknown }[]): SurveyMoment {
  const fields = questions.filter((question) => question.role === "MOMENT");
  if (!fields.length) return payload.surveyMoment;
  if (fields.length !== 1) return "UNKNOWN";
  const answers = payload.answers.filter((answer) => answer.questionId === fields[0]!.externalId);
  if (answers.length !== 1 || typeof answers[0]!.value !== "string") return "UNKNOWN";
  const mappings = MomentMappingSchema.safeParse(fields[0]!.momentMappings);
  if (!mappings.success) return "UNKNOWN";
  return mappings.data.find((mapping) => mapping.value === String(answers[0]!.value).trim())?.moment ?? "UNKNOWN";
}
