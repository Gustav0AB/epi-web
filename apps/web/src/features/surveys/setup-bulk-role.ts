import type { SurveySetupQuestion } from "@epi/shared";

type Question = SurveySetupQuestion & { options: string[] };
export function applyBulkRole(questions: Question[], ids: string[], role: NonNullable<SurveySetupQuestion["role"]>) {
  const selected = questions.filter(question => ids.includes(question.externalId));
  const unique = ["ACTIVITY", "SCHOOL_GROUP", "IDENTIFIER", "MOMENT"].includes(role);
  if (unique && (selected.length !== 1 || questions.some(question => question.role === role && !ids.includes(question.externalId)))) return { changed: [], skipped: selected.length, error: "Este rol solo puede asignarse a una pregunta del instrumento." };
  const eligible = selected.filter(question => !(role === "SCORED" && question.type === "OPEN_TEXT") && !(role === "MOMENT" && !question.options.length));
  return { changed: eligible.map(question => ({ ...question, role, setupReviewed: false, isFilter: role === "SCORED" ? false : question.isFilter })), skipped: selected.length - eligible.length, error: null };
}
