import { assistantScoringReady, configuredForAnalysis, prePostOptionPoints, scorePrePostAnswer, SurveySetupQuestionSchema, type CourseDemographics, type CourseResultsDto, type PrePostBase, type PrePostQuestionBase, type PrePostQuestion } from "@epi/shared";
import { z } from "zod";
import { AnswerJsonSchema } from "./surveys.schema.js";
import { expandMatrixAnswers } from "./matrix-answers.js";
const sourceSchema = z.object({ answers: z.array(z.object({ questionId: z.string(), value: AnswerJsonSchema })), unresolvedAnswers: z.array(z.unknown()).optional() });
export type ResultsDefinition = { id: string; instrumentName: string | null; version: number; configurationVersion: number | null; instrumentKind: string | null; analysisWeights?: unknown; questions: { id: string; externalId: string; text: string; type: string; role: string; options: string[]; classification: unknown; analysisParticipation: unknown; analysisScoring: unknown; sourceContext: unknown; weight: { factor: number } | null }[] };
export type ResultsReceipt = { definition: ResultsDefinition; rawJsonData: unknown; moment: string; excluded: boolean; contextPending: boolean; gender?: string | null };
const emptyBase = (): PrePostBase => ({ valid: 0, blank: 0, nonScorable: 0, invalid: 0, configurationPending: 0, zeroMaximum: 0, points: 0, applicableMaximum: 0 });
const emptyGroup = () => ({ receipts: 0, complete: 0, incomplete: 0, withoutData: 0, validAnswers: 0 });
export function courseResultsAnswers(raw: unknown, definition: ResultsDefinition): Map<string,unknown[]> | null {
  const parsed = sourceSchema.safeParse(raw); if (!parsed.success || parsed.data.unresolvedAnswers?.length) return null;
  const expanded = expandMatrixAnswers(parsed.data.answers, definition.questions); if (expanded.warnings.length) return null;
  const answers = new Map<string,unknown[]>();
  for (const answer of expanded.answers) answers.set(answer.questionId,[...(answers.get(answer.questionId) ?? []),answer.value]);
  return answers;
}
export function courseResultBases(receipts: ResultsReceipt[], definitions: ResultsDefinition[] = []) {
  const questions = new Map<string, { output: PrePostQuestionBase; question: PrePostQuestion | null }>();
  const groups = new Map<string, CourseResultsDto["groups"][number]>();
  const demographics: CourseDemographics = { pre: { men: 0, women: 0, other: 0, unknown: 0 }, post: { men: 0, women: 0, other: 0, unknown: 0 } };
  const counts = { preReceipts: 0, postReceipts: 0, excludedReceipts: 0, contextPendingReceipts: 0, sourcePendingReceipts: 0, complementaryReceipts: 0, unsupportedVersionReceipts: 0 };
  // Rules are frozen in each definition; never match questions across versions by text.
  for (const definition of new Map([...definitions, ...receipts.map(receipt => receipt.definition)].map(definition => [definition.id, definition])).values()) {
    if (definition.instrumentKind !== "LEARNING" || definition.configurationVersion !== 4) continue;
    for (const source of definition.questions) {
      if (source.role !== "SCORED" || source.type === "OPEN_TEXT") continue;
      const parsed = SurveySetupQuestionSchema.safeParse({ ...source, weight: undefined });
      const question = parsed.success ? { ...parsed.data, options: source.options } : null;
      if (question && question.analysisParticipation && !configuredForAnalysis(question, "pre_post")) continue;
      const ready = !!question && !!question.analysisParticipation && assistantScoringReady([question], "pre_post") && !!question.classification?.category && !!question.classification.subcategory;
      const rule = question?.analysisScoring?.find(item => item.analysisType === "pre_post");
      const output: PrePostQuestionBase = { id: source.id, definitionId: definition.id, instrument: definition.instrumentName || "Instrumento", version: definition.version, text: source.text, category: question?.classification?.category || null, subcategory: question?.classification?.subcategory || null, factor: source.weight?.factor ?? 1, maximum: ready ? rule!.maxScore : null, configurationReady: ready, rule: !ready ? "Configuración pendiente" : rule!.scoringMode === "ordered_scale" ? rule!.inverse ? "Escala inversa" : "Escala descendente" : "Respuesta correcta", options: ready ? prePostOptionPoints(question!) : [], pre: emptyBase(), post: emptyBase() };
      questions.set(source.id, { output, question });
      const key = JSON.stringify([definition.id, output.category, output.subcategory]);
      if (!groups.has(key)) groups.set(key, { definitionId: definition.id, instrument: output.instrument, version: definition.version, category: output.category, subcategory: output.subcategory, pre: emptyGroup(), post: emptyGroup() });
    }
  }
  for (const receipt of receipts) {
    if (receipt.excluded) { counts.excludedReceipts++; continue; }
    if (receipt.contextPending) { counts.contextPendingReceipts++; continue; }
    if (receipt.definition.instrumentKind !== "LEARNING") { counts.complementaryReceipts++; continue; }
    if (receipt.definition.configurationVersion !== 4) { counts.unsupportedVersionReceipts++; continue; }
    if (receipt.moment !== "PRE" && receipt.moment !== "POST") { counts.contextPendingReceipts++; continue; }
    const answers = courseResultsAnswers(receipt.rawJsonData, receipt.definition);
    if (!answers) { counts.sourcePendingReceipts++; continue; }
    const moment = receipt.moment === "PRE" ? "pre" : "post";
    counts[moment === "pre" ? "preReceipts" : "postReceipts"]++;
    const gender = receipt.gender?.trim().toLowerCase();
    const group = ["hombre", "masculino", "male", "man"].includes(gender ?? "") ? "men" : ["mujer", "femenino", "female", "woman"].includes(gender ?? "") ? "women" : !gender || ["prefiero no responder", "prefiero no decir", "prefer not to say"].includes(gender) ? "unknown" : "other";
    demographics[moment][group]++;
    const groupStats = new Map<string, { total: number; valid: number }>();
    for (const source of receipt.definition.questions) {
      const entry = questions.get(source.id); if (!entry) continue;
      const { output, question } = entry;
      const result = question && output.configurationReady ? scorePrePostAnswer(question, answers.get(source.externalId) ?? []) : { reason: "configuration_pending" as const, points: null, maximum: null };
      const base = output[moment];
      const keys = { valid: "valid", blank: "blank", non_scorable: "nonScorable", invalid: "invalid", configuration_pending: "configurationPending", zero_maximum: "zeroMaximum" } as const;
      base[keys[result.reason]]++;
      if (result.reason === "valid") { const points = base.points === null ? NaN : base.points + result.points!; const maximum = base.applicableMaximum === null ? NaN : base.applicableMaximum + result.maximum!; base.points = Number.isFinite(points) ? points : null; base.applicableMaximum = Number.isFinite(maximum) ? maximum : null; }
      const key = JSON.stringify([receipt.definition.id, output.category, output.subcategory]);
      const stats = groupStats.get(key) ?? { total: 0, valid: 0 }; stats.total++; if (result.reason === "valid") stats.valid++; groupStats.set(key, stats);
    }
    for (const [key, stats] of groupStats) { const group = groups.get(key)![moment]; group.receipts++; group.validAnswers += stats.valid; if (stats.valid === stats.total) group.complete++; else if (stats.valid) group.incomplete++; else group.withoutData++; }
  }
  for (const { output } of questions.values()) for (const moment of ["pre", "post"] as const) if (!output[moment].valid) { output[moment].points = null; output[moment].applicableMaximum = null; }
  return { ...counts, demographics, questions: [...questions.values()].map(item => item.output), groups: [...groups.values()] };
}
