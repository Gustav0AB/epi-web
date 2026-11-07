import { questionClassification } from "./question-classification.js";
import type { MatrixDefaults, SurveySetupDraft, SurveySetupQuestion } from "./schemas/survey.schema.js";

export function applyMatrixDefaults<T extends SurveySetupQuestion>(questions: T[], defaults: MatrixDefaults = []): T[] {
  return questions.map(question => {
    const parent = question.sourceContext?.matrix?.externalId;
    const group = defaults.find(item => item.externalId === parent);
    if (!parent || !group || question.matrixOverride === true) return question;
    return { ...question, role: group.role ?? "SCORED", classification: group.classification ?? null, analysisParticipation: group.analysisParticipation ?? null, analysisScoring: group.analysisScoring == null ? null : JSON.parse(JSON.stringify(group.analysisScoring)) };
  });
}

export function configurationChanges(before: SurveySetupDraft, after: SurveySetupDraft) {
  const changes: string[] = [];
  const labels = { siteId: "Sitio", type: "Clasificación de programa", programName: "Programa", instrumentKind: "Tipo de instrumento", instrumentName: "Instrumento", activityName: "Actividad", activityType: "Tipo de actividad", description: "Descripción", analysisWeights: "Ponderaciones por análisis", matrixDefaults: "Reglas generales de matrices" };
  const comparable = (question: SurveySetupQuestion) => ({ text: question.text, type: question.type, role: question.role ?? "SCORED", classification: questionClassification(question), analysisParticipation: question.analysisParticipation ?? null, analysisScoring: question.analysisScoring ?? null, isFilter: question.isFilter ?? false, optionLabels: question.optionLabels ?? [], momentMappings: question.momentMappings ?? [], sourceContext: question.sourceContext ?? null, matrixOverride: question.matrixOverride ?? false, weight: question.weight ?? null });
  for (const field of ["siteId", "type", "programName", "instrumentKind", "instrumentName", "activityName", "activityType", "description", "analysisWeights", "matrixDefaults"] as const) {
    if (JSON.stringify(before[field] || null) !== JSON.stringify(after[field] || null)) changes.push(labels[field]);
  }
  const oldRows = new Map(applyMatrixDefaults(before.questions ?? [], before.matrixDefaults).map(item => [item.externalId, item]));
  for (const row of applyMatrixDefaults(after.questions ?? [], after.matrixDefaults)) {
    const old = oldRows.get(row.externalId);
    if (!old || JSON.stringify(comparable(old)) !== JSON.stringify(comparable(row))) changes.push(`${old ? "Pregunta modificada" : "Pregunta nueva"}: ${row.text}`);
    oldRows.delete(row.externalId);
  }
  for (const row of oldRows.values()) changes.push(`Pregunta retirada: ${row.text}`);
  return changes;
}

export function matrixConfigurationEdits<T extends SurveySetupQuestion>(questions: T[], current: SurveySetupQuestion[], preserveInheritance = false): T[] {
  return questions.map(question => question.sourceContext?.matrix && !preserveInheritance && JSON.stringify(question) !== JSON.stringify(current.find(item => item.externalId === question.externalId)) ? { ...question, matrixOverride: true } : question);
}

export function preserveOpenQuestion<T extends SurveySetupQuestion>(question: T): T {
  return { ...question, type: "OPEN_TEXT", role: question.role === "SCORED" || !question.role ? "INFORMATIONAL" : question.role, weight: null, analysisParticipation: null, analysisScoring: null };
}
export function individualMatrixQuestions<T extends SurveySetupQuestion>(questions: T[], defaults: MatrixDefaults = []): T[] {
  return applyMatrixDefaults(questions, defaults).map(question => {
    const current = question.type === "OPEN_TEXT" ? preserveOpenQuestion(question) : question;
    return current.sourceContext?.matrix ? { ...current, matrixOverride: true } : current;
  });
}
export function questionSection(question: Pick<SurveySetupQuestion, "sourceContext">): { key: string; label: string } {
  if (question.sourceContext?.matrix) return { key: `matrix:${question.sourceContext.matrix.externalId}`, label: question.sourceContext.matrix.text };
  if (question.sourceContext?.section) return { key: `section:${question.sourceContext.section.externalId}`, label: question.sourceContext.section.text };
  return { key: "unsectioned", label: "Sin sección" };
}
