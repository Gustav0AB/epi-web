import { assistantScoringReady, analysisScoringReady, configuredForAnalysis, QuestionAnalysisScoringSchema, setAnalysisScoring, SurveySetupQuestionSchema, type QuestionWithWeight, type SurveyDefinitionDto, type AnalysisType, type SurveySetupQuestion } from "@epi/shared";

type Question = SurveySetupQuestion & { options: string[] };
export type AnalysisReuseRow = {
  externalId: string;
  text: string;
  fingerprint: string;
  sourceText?: string;
  status: "ready" | "existing" | "source_inactive" | "unconfigured" | "invalid" | "unmatched" | "ambiguous";
  rule: NonNullable<SurveySetupQuestion["analysisScoring"]>[number] | null;
};

export function previewAnalysisReuse(questions: Question[], source: AnalysisType, target: AnalysisType, assistant = false): AnalysisReuseRow[] {
  if (source === target) return [];
  return questions.filter(question => configuredForAnalysis(question, target)).map(question => {
    const row: AnalysisReuseRow = { externalId: question.externalId, text: question.text, fingerprint: JSON.stringify(question), status: "unconfigured", rule: null };
    if (question.analysisScoring?.some(rule => rule.analysisType === target)) return { ...row, status: "existing" };
    if (!configuredForAnalysis(question, source)) return { ...row, status: "source_inactive" };
    const rule = question.analysisScoring?.find(rule => rule.analysisType === source);
    if (!rule) return row;
    const parsed = QuestionAnalysisScoringSchema.safeParse([rule]);
    if (!parsed.success || !(assistant ? assistantScoringReady : analysisScoringReady)([question], source)) return { ...row, status: "invalid" };
    return { ...row, status: "ready", rule: { ...parsed.data[0]!, analysisType: target } };
  });
}

export function applyAnalysisReuse<T extends Question>(questions: T[], source: AnalysisType, target: AnalysisType, reviewed: AnalysisReuseRow[], selectedIds: string[], assistant = false): T[] {
  const selected = new Set(selectedIds);
  const current = previewAnalysisReuse(questions, source, target, assistant);
  return current.reduce((result, row) => {
    const accepted = reviewed.find(item => item.externalId === row.externalId);
    // A changed question or source rule must be reviewed again before copying.
    if (!selected.has(row.externalId) || row.status !== "ready" || accepted?.status !== "ready" || row.fingerprint !== accepted.fingerprint || JSON.stringify(row.rule) !== JSON.stringify(accepted.rule)) return result;
    return setAnalysisScoring(result, row.externalId, target, row.rule!);
  }, questions);
}

export function previewInstrumentAnalysisReuse(questions: Question[], sources: QuestionWithWeight[], definitionId: string, source: AnalysisType, target: AnalysisType, assistant = false): AnalysisReuseRow[] {
  const text = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return questions.filter(question => configuredForAnalysis(question, target)).map(question => {
    const row: AnalysisReuseRow = { externalId: question.externalId, text: question.text, fingerprint: JSON.stringify(question), status: "unmatched", rule: null };
    if (question.analysisScoring?.some(rule => rule.analysisType === target)) return { ...row, status: "existing" };
    const matches = sources.filter(candidate => (candidate.role ?? "SCORED") === "SCORED" && candidate.type === question.type && text(candidate.text) === text(question.text) && JSON.stringify(candidate.options) === JSON.stringify(question.options));
    if (!matches.length) return row;
    if (matches.length > 1) return { ...row, status: "ambiguous" };
    const candidate = matches[0]!;
    const parsed = SurveySetupQuestionSchema.safeParse({ ...candidate, weight: null });
    if (!parsed.success) return { ...row, status: "invalid" };
    const origin = { ...parsed.data, options: candidate.options };
    if (!configuredForAnalysis(origin, source)) return { ...row, status: "source_inactive" };
    const rule = origin.analysisScoring?.find(item => item.analysisType === source);
    if (!rule) return { ...row, status: "unconfigured" };
    if (!(assistant ? assistantScoringReady : analysisScoringReady)([origin], source)) return { ...row, status: "invalid" };
    const copied = { ...rule, analysisType: target };
    if (!(assistant ? assistantScoringReady : analysisScoringReady)([{ ...question, analysisScoring: [copied] }], target)) return { ...row, status: "invalid" };
    return { ...row, sourceText: candidate.text, fingerprint: JSON.stringify({ question, definitionId, sourceId: candidate.id, origin }), status: "ready", rule: copied };
  });
}

export function applyInstrumentAnalysisReuse<T extends Question>(questions: T[], sources: QuestionWithWeight[], definitionId: string, source: AnalysisType, target: AnalysisType, reviewed: AnalysisReuseRow[], selectedIds: string[], assistant = false): T[] {
  const selected = new Set(selectedIds);
  return previewInstrumentAnalysisReuse(questions, sources, definitionId, source, target, assistant).reduce((result, row) => {
    const accepted = reviewed.find(item => item.externalId === row.externalId);
    if (!selected.has(row.externalId) || row.status !== "ready" || accepted?.status !== "ready" || row.fingerprint !== accepted.fingerprint || JSON.stringify(row.rule) !== JSON.stringify(accepted.rule)) return result;
    return setAnalysisScoring(result, row.externalId, target, row.rule!);
  }, questions);
}

export type AnalysisReuseScope = { organizationId: string; formId: string; surveyType: "LOCAL" | "VISITING" | "OTHER" };
export function availableAnalysisReuseDefinitions(definitions: SurveyDefinitionDto[], scope: AnalysisReuseScope) {
  return definitions.filter(definition => definition.organizationId === scope.organizationId && definition.type === scope.surveyType && definition.jotformFormId !== scope.formId && definition.instrumentKind !== "CQS");
}
