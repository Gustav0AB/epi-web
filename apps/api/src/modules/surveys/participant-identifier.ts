import type { JotformPayload } from "./surveys.schema.js";

export function resolveParticipantIdentifier(
  payload: JotformPayload,
  questions: { externalId: string; role?: string }[],
): string | null {
  const identifiers = questions.filter((question) => question.role === "IDENTIFIER");
  if (!identifiers.length) return payload.participant?.id ?? null;
  if (identifiers.length !== 1) return null;
  const answers = payload.answers.filter((answer) => answer.questionId === identifiers[0]!.externalId);
  if (answers.length !== 1) return null;
  const value = answers[0]!.value;
  if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) return null;
  return String(value).trim() || null;
}
