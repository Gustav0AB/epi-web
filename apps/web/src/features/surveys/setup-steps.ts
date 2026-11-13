import { incompleteLearningMoment, assistantScoringReady, questionCatalogIssue, questionClassification, type CategoryDto, type SurveySetupQuestion } from "@epi/shared";

type SetupQuestion = SurveySetupQuestion & { options: string[]; controlType?: string };

export function incompleteQuestionMoment(question: SetupQuestion) {
  return question.role === "MOMENT" && incompleteLearningMoment(question);
}

export function invalidQuestionFilter(question: SetupQuestion) {
  return Boolean((question.isFilter || question.role === "FILTER") &&
    (!["control_radio", "control_dropdown", "control_yesno"].includes(question.controlType ?? "") ||
    !question.options.length || question.optionLabels?.some(item => !question.options.includes(item.value))));
}

export function questionSetupIssue(question: SetupQuestion, questions: SetupQuestion[], categories: CategoryDto[], organizationId: string | null, catalogPending: boolean, source: SurveySetupQuestion | undefined) {
  if (question.sourceContext?.matrix && JSON.stringify(question.sourceContext.matrix) !== JSON.stringify(source?.sourceContext?.matrix)) return "Confirma la pregunta actual del formulario.";
  if (question.role && ["ACTIVITY", "SCHOOL_GROUP", "IDENTIFIER", "MOMENT"].includes(question.role) && questions.some(other => other.externalId !== question.externalId && other.role === question.role)) return "Este rol solo se puede asignar a una pregunta.";
  if (incompleteQuestionMoment(question)) return "Asigna al menos una respuesta a Pre y otra a Post; las demás quedarán para revisión.";
  if (invalidQuestionFilter(question)) return "Revisa las opciones del filtro.";
  if (catalogPending && (question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT") return "Catálogo de subcategorías aún no disponible.";
  return questionCatalogIssue(question, categories, organizationId, true);
}

export function inheritActiveQuestionReview<T extends SetupQuestion>(question: T, active: SurveySetupQuestion | undefined, categories: CategoryDto[], organizationId: string | null): T & { setupReviewed?: boolean | undefined } {
  if (question.setupReviewed !== undefined || !active || question.role !== "SCORED" || question.type === "OPEN_TEXT") return question;
  const unchanged = question.type === active.type && question.role === active.role &&
    JSON.stringify(question.classification ?? null) === JSON.stringify(active.classification ?? null) &&
    JSON.stringify(question.analysisScoring ?? null) === JSON.stringify(active.analysisScoring ?? null) &&
    JSON.stringify(question.weight ?? null) === JSON.stringify(active.weight ?? null);
  if (!unchanged || questionCatalogIssue(question, categories, organizationId, true) || !assistantScoringReady([question], "pre_post")) return question;
  return { ...question, setupReviewed: true };
}

export function isQuestionSetupReviewed(question: SurveySetupQuestion, issue: string | null) {
  return question.setupReviewed === true && !issue;
}

export function setQuestionSetupReview<T extends SurveySetupQuestion>(question: T, reviewed: boolean, issue: string | null): T {
  return { ...question, setupReviewed: reviewed && !issue };
}

export type SetupStep = 1 | 2 | 3 | 4 | 5;

export function canContinueSetup(step: SetupStep, state: {
  generalReady: boolean;
  questionsReady: boolean;
  weightsReady: boolean;
  scoringReady: boolean;
}): boolean {
  if (!state.generalReady) return false;
  if (step === 1) return true;
  if (!state.questionsReady) return false;
  if (step === 2) return true;
  if (!state.weightsReady) return false;
  return step === 3 || state.scoringReady;
}

export function scoringQuestionPage(ids: string[], id: string): number | null {
  const index = ids.indexOf(id);
  return index < 0 ? null : Math.floor(index / 10) + 1;
}

export function shouldSaveSetupDraft(dirty: boolean, hasStoredDraft: boolean, questions: SurveySetupQuestion[], storedQuestions: SurveySetupQuestion[]) {
  return dirty || !hasStoredDraft || JSON.stringify(questions) !== JSON.stringify(storedQuestions);
}

export function setSetupQuestionFactor<T extends SurveySetupQuestion>(question: T, factor: number): T {
  const group = questionClassification(question);
  const maximum = question.analysisScoring?.find(rule => rule.analysisType === "pre_post")?.maxScore;
  if (!group?.category || maximum == null || !Number.isInteger(factor) || factor < 1 || factor > 10) return question;
  return { ...question, weight: { ...question.weight, category: group.category, subcategory: group.subcategory ?? null, maxScore: question.weight?.maxScore ?? maximum, correctAnswer: question.weight?.correctAnswer ?? null, factor } };
}
