import { questionCatalogIssue, type CategoryDto, type SurveySetupQuestion } from "@epi/shared";

type SetupQuestion = SurveySetupQuestion & { options: string[]; controlType?: string };

export function incompleteQuestionMoment(question: SetupQuestion) {
  return question.role === "MOMENT" && (!question.options.length ||
    question.options.some(option => !question.momentMappings?.some(mapping => mapping.value === option)) ||
    question.momentMappings?.some(mapping => !question.options.includes(mapping.value)));
}

export function invalidQuestionFilter(question: SetupQuestion) {
  return Boolean((question.isFilter || question.role === "FILTER") &&
    (!["control_radio", "control_dropdown", "control_yesno"].includes(question.controlType ?? "") ||
    !question.options.length || question.optionLabels?.some(item => !question.options.includes(item.value))));
}

export function questionSetupIssue(question: SetupQuestion, questions: SetupQuestion[], categories: CategoryDto[], organizationId: string | null, catalogPending: boolean, source: SurveySetupQuestion | undefined) {
  if (question.sourceContext?.matrix && JSON.stringify(question.sourceContext.matrix) !== JSON.stringify(source?.sourceContext?.matrix)) return "Confirma la pregunta actual del formulario.";
  if (question.role && ["ACTIVITY", "SCHOOL_GROUP", "IDENTIFIER", "MOMENT"].includes(question.role) && questions.some(other => other.externalId !== question.externalId && other.role === question.role)) return "Este rol solo se puede asignar a una pregunta.";
  if (incompleteQuestionMoment(question)) return "Revisa el momento asignado a cada respuesta del formulario.";
  if (invalidQuestionFilter(question)) return "Revisa las opciones del filtro.";
  if (catalogPending && (question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT") return "Catálogo de subcategorías aún no disponible.";
  return questionCatalogIssue(question, categories, organizationId, true);
}

export function isQuestionSetupReviewed(question: SurveySetupQuestion, issue: string | null) {
  return question.setupReviewed === true && !issue;
}

export function setQuestionSetupReview<T extends SurveySetupQuestion>(question: T, reviewed: boolean, issue: string | null): T {
  return { ...question, setupReviewed: reviewed && !issue };
}

export type SetupStep = 1 | 2 | 3 | 4;

export function canContinueSetup(step: SetupStep, state: {
  generalReady: boolean;
  questionsReady: boolean;
  weightsReady: boolean;
}): boolean {
  if (!state.generalReady) return false;
  if (step === 1) return true;
  if (!state.questionsReady) return false;
  return step === 2 || state.weightsReady;
}
