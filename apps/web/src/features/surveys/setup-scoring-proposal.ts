import { assistantScoringReady, analysisScoringReady, configuredForAnalysis, QuestionAnalysisScoringSchema, setAnalysisScoring, type AnalysisType, type SurveySetupQuestion } from "@epi/shared";

type Question = SurveySetupQuestion & { options: string[] };
export type ScoringProposal = {
  externalId: string;
  text: string;
  fingerprint: string;
  reason: string;
  rule: NonNullable<SurveySetupQuestion["analysisScoring"]>[number] | null;
};

export function previewScoringProposal(questions: Question[], analysis: AnalysisType, assistant = false): ScoringProposal[] {
  return questions.filter(question => configuredForAnalysis(question, analysis)).map(question => {
    const row: ScoringProposal = { externalId: question.externalId, text: question.text, fingerprint: JSON.stringify(question), reason: "Requiere configurar la escala manualmente", rule: null };
    if (question.analysisScoring?.some(rule => rule.analysisType === analysis)) return { ...row, reason: "Ya tiene regla; se conserva incluso si está incompleta" };
    if (question.type === "ONE_ANSWER") return { ...row, reason: "La respuesta correcta requiere una decisión manual" };
    if (assistant) {
      if (question.options.length < 2 || new Set(question.options).size !== question.options.length) return row;
      return { ...row, reason: "Revisa el máximo sugerido (número de opciones), el orden y la inversión antes de aceptar", rule: { analysisType: analysis, maxScore: question.options.length, correctAnswer: null, scoringMode: "ordered_scale", inverse: false, scaleOptions: [...question.options], responsePolicy: { blank: "exclude", invalid: "review" } } };
    }
    const values = question.options.map(value => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ? Number(value) : NaN);
    if (values.length < 2 || new Set(question.options).size !== values.length || values.some(value => !Number.isFinite(value)) || Math.max(...values) <= 0) return row;
    return { ...row, reason: "Propuesta provisional: puntos iguales a los valores numéricos. Revisa significado y dirección", rule: { analysisType: analysis, maxScore: Math.max(...values), correctAnswer: null, scoringMode: "option_scores", optionScores: question.options.map((value, index) => ({ value, score: values[index]! })) } };
  });
}

export function validatedScoringProposal(question: Question, analysis: AnalysisType, reviewed: ScoringProposal, assistant = false) {
  const current = previewScoringProposal([question], analysis, assistant)[0];
  if (!current?.rule || current.fingerprint !== reviewed.fingerprint || reviewed.externalId !== question.externalId || !reviewed.rule) return null;
  const parsed = QuestionAnalysisScoringSchema.safeParse([reviewed.rule]);
  if (!parsed.success || parsed.data[0]!.analysisType !== analysis || parsed.data[0]!.scoringMode !== (assistant ? "ordered_scale" : "option_scores") || !(assistant ? assistantScoringReady : analysisScoringReady)([{ ...question, analysisScoring: parsed.data }], analysis)) return null;
  return parsed.data[0]!;
}

export function applyScoringProposal<T extends Question>(questions: T[], analysis: AnalysisType, reviewed: ScoringProposal[], selectedIds: string[], assistant = false): T[] {
  const selected = new Set(selectedIds);
  return questions.reduce((result, question) => {
    const row = reviewed.find(item => item.externalId === question.externalId);
    const rule = row && selected.has(question.externalId) ? validatedScoringProposal(question, analysis, row, assistant) : null;
    return rule ? setAnalysisScoring(result, question.externalId, analysis, rule) : result;
  }, questions);
}

export function applyAutomaticScoringProposal<T extends Question>(questions: T[], analysis: AnalysisType): T[] {
  const proposals = previewScoringProposal(questions, analysis, true).filter(row => row.rule);
  return applyScoringProposal(questions, analysis, proposals, proposals.map(row => row.externalId), true);
}
