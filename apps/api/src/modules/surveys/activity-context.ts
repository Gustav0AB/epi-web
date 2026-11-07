export function configuredActivityContext(
  answers: { questionId: string; value: unknown }[],
  questions: { externalId: string; role?: string }[],
) {
  const fields = questions.filter(question => question.role === "ACTIVITY");
  if (!fields.length) return undefined;
  const matches = answers.filter(answer => answer.questionId === fields[0]!.externalId);
  const review = { original: null, activity: null, needsReview: true };
  if (fields.length !== 1 || matches.length !== 1) return review;
  const original = matches[0]!.value;
  if (typeof original !== "string") return review;
  const activity = original.trim().replace(/\s+/g, " ");
  return { original, activity: activity || null, needsReview: !activity };
}
