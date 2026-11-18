import type { SurveySetupQuestion } from "@epi/shared";
import { applyBulkRole } from "./setup-bulk-role";

type Question = SurveySetupQuestion & { options: string[] };
type Changes = { role?: NonNullable<SurveySetupQuestion["role"]>; classification?: { category: string; subcategory: string }; review?: "reviewed" | "pending" };

export function applyBulkEdits(questions: Question[], ids: string[], changes: Changes, issue: (question: Question, all: Question[]) => string | null) {
  const selected = questions.filter(question => ids.includes(question.externalId));
  const roleResult = changes.role ? applyBulkRole(questions, ids, changes.role) : { changed: selected, skipped: 0, error: null };
  if (roleResult.error) return { changed: [] as Question[], skipped: selected.length, pending: 0, error: roleResult.error };
  let skipped = roleResult.skipped;
  const candidates = roleResult.changed.flatMap(question => {
    if (changes.classification && ((question.role ?? "SCORED") !== "SCORED" || question.type === "OPEN_TEXT")) { skipped++; return []; }
    return [{ ...question, ...(changes.role && changes.role !== "SCORED" ? { weight: null } : {}), ...(changes.classification ? { classification: changes.classification } : {}) }];
  });
  const all = questions.map(question => candidates.find(item => item.externalId === question.externalId) ?? question);
  const changed = candidates.map(question => ({ ...question, setupReviewed: changes.review === "pending" ? false : !issue(question, all) }));
  const pending = changed.filter(question => !question.setupReviewed).length;
  return { changed, skipped, pending, error: null };
}
