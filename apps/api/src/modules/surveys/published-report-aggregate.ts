import { buildCourseReportPreview, type CourseResultsDto, type PrePostBase } from "@epi/shared";
import { aggregateCourseQuestions } from "./course-aggregation.js";
import type { ResultsDefinition } from "./course-results.js";

function sumBase(bases: PrePostBase[]): PrePostBase {
  const sum = (key: "valid" | "blank" | "nonScorable" | "invalid" | "configurationPending" | "zeroMaximum") =>
    bases.reduce((total, base) => total + base[key], 0);
  const sumNullable = (key: "points" | "applicableMaximum") =>
    bases.some(base => base[key] !== null) ? bases.reduce<number>((total, base) => total + (base[key] ?? 0), 0) : null;
  return {
    valid: sum("valid"), blank: sum("blank"), nonScorable: sum("nonScorable"),
    invalid: sum("invalid"), configurationPending: sum("configurationPending"), zeroMaximum: sum("zeroMaximum"),
    points: sumNullable("points"), applicableMaximum: sumNullable("applicableMaximum"),
  };
}

export function aggregatePublishedCourses(results: CourseResultsDto[]) {
  if (!results.length) throw new Error("No hay cursos publicados para los filtros elegidos");
  const first = results[0]!;
  const questionConfiguration = (result: CourseResultsDto) => JSON.stringify(result.questions.map(({ pre, post, ...configuration }) => configuration).sort((a, b) => a.id.localeCompare(b.id)));
  const configuration = questionConfiguration(first);
  const classification = JSON.stringify(first.categorySelection?.included?.slice().sort() ?? []);
  const distribution = JSON.stringify(first.distributions);
  if (results.some(result =>
    result.primaryDefinitionId !== first.primaryDefinitionId ||
    questionConfiguration(result) !== configuration ||
    JSON.stringify(result.categorySelection?.included?.slice().sort() ?? []) !== classification ||
    JSON.stringify(result.distributions) !== distribution
  )) throw new Error("Los cursos tienen configuraciones o categorías publicadas diferentes y requieren revisión por separado");

  const questions = first.questions.map(question => {
    const matches = results.map(result => result.questions.find(item => item.id === question.id)!);
    return { ...question, pre: sumBase(matches.map(item => item.pre)), post: sumBase(matches.map(item => item.post)) };
  });
  const settings = first.distributions.find(item => item.definitionId === first.primaryDefinitionId);
  if (!settings?.categoryWeights || !settings.subcategoryWeights) throw new Error("La distribución publicada está incompleta");
  const definition: ResultsDefinition = {
    id: first.primaryDefinitionId, instrumentName: settings.instrument, version: settings.version,
    instrumentKind: "LEARNING", configurationVersion: 4, questions: [],
    analysisWeights: [{ analysisType: "pre_post", categoryWeights: settings.categoryWeights, subcategoryWeights: settings.subcategoryWeights }],
  };
  const sumCount = (key: "preReceipts" | "postReceipts" | "excludedReceipts" | "contextPendingReceipts" | "sourcePendingReceipts" | "complementaryReceipts" | "unsupportedVersionReceipts") =>
    results.reduce((total, result) => total + result[key], 0);
  const sumExpected = (key: "expectedParticipants" | "expectedParticipantsPre" | "expectedParticipantsPost") =>
    results.every(result => result[key] !== null) ? results.reduce((total, result) => total + result[key]!, 0) : null;
  const groupKeys = new Map(results.flatMap(result => result.groups).map(group => [JSON.stringify([group.definitionId, group.category, group.subcategory]), group]));
  const groups = [...groupKeys.values()].map(group => {
    const matching = results.flatMap(result => result.groups.filter(item => item.definitionId === group.definitionId && item.category === group.category && item.subcategory === group.subcategory));
    const sumMoment = (moment: "pre" | "post") => ({
      receipts: matching.reduce((sum, item) => sum + item[moment].receipts, 0),
      complete: matching.reduce((sum, item) => sum + item[moment].complete, 0),
      incomplete: matching.reduce((sum, item) => sum + item[moment].incomplete, 0),
      withoutData: matching.reduce((sum, item) => sum + item[moment].withoutData, 0),
      validAnswers: matching.reduce((sum, item) => sum + item[moment].validAnswers, 0),
    });
    return { ...group, pre: sumMoment("pre"), post: sumMoment("post") };
  });
  const merged: CourseResultsDto = {
    ...first, courseId: "", name: "Cursos del periodo", school: "Todas las escuelas", activity: "Varias actividades",
    questions, groups, aggregates: aggregateCourseQuestions(questions, [definition]),
    preReceipts: sumCount("preReceipts"), postReceipts: sumCount("postReceipts"),
    excludedReceipts: sumCount("excludedReceipts"), contextPendingReceipts: sumCount("contextPendingReceipts"),
    sourcePendingReceipts: sumCount("sourcePendingReceipts"), complementaryReceipts: sumCount("complementaryReceipts"),
    unsupportedVersionReceipts: sumCount("unsupportedVersionReceipts"),
    expectedParticipants: sumExpected("expectedParticipants"),
    expectedParticipantsPre: sumExpected("expectedParticipantsPre"),
    expectedParticipantsPost: sumExpected("expectedParticipantsPost"),
    pending: [...new Set(results.flatMap(result => result.pending))],
  };
  const report = buildCourseReportPreview(merged, { templateKey: "course-impacts-general", textContent: {} }, true);
  report.template.blocks = report.template.blocks.map(block => block.id === "course-review-context" ? {
    ...block, content: `Resultados de ${results.length} cursos publicados.\nEnvíos Pre: ${merged.preReceipts}; Post: ${merged.postReceipts}.\nCategorías incluidas: ${merged.categorySelection?.included.join(", ") ?? "Todas"}.\nLos envíos no representan necesariamente personas únicas.`,
  } : block);
  return report;
}
