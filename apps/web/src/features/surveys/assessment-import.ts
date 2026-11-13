import { assistantScoringReady, type CategoryDto, type SurveySetupDraft } from "@epi/shared";
import { categoryLabel, instrumentConfigRows, previewInstrumentTable, responseTypes, type ConfigQuestion, type ConfigRow } from "./instrument-config-table";
import type { AssessmentParseResult } from "./assessment-csv";
import { questionSetupIssue } from "./setup-steps";

const normalized = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
export const assessmentCategoryKey = (subcategory: string | null, column: number) => subcategory?.trim() ? normalized(subcategory) : `column:${column}`;
const expectedType = { one_answer: "ONE_ANSWER", likert: "LIKERT", frequency: "FREQUENCY" } as const;
export function previewAssessmentImport(parsed: AssessmentParseResult, draft: SurveySetupDraft, questions: ConfigQuestion[], categories: CategoryDto[], protectedIds: string[], confirmed: Record<number, string> = {}, selectedCategories: Record<string, string> = {}) {
  const visible = questions.filter(question => !question.sourceContext?.matrixParent);
  const targetRows = instrumentConfigRows(draft, questions).rows;
  const candidates = parsed.columns.map(source => {
    const targets = visible.map((question, index) => ({ question, index }));
    const exact = targets.filter(({ question }) => normalized(question.text) === normalized(source.question.question));
    if (exact.length) return { source, matches: exact, matrixMatch: false };
    const separator = source.question.question.lastIndexOf(">>");
    if (separator < 0) {
      const options = source.options.filter(Boolean);
      const possible = source.question.type === "one_answer" && options.length > 0 ? targets.filter(({ question }) => question.type === "ONE_ANSWER" && JSON.stringify(question.options) === JSON.stringify(options)) : [];
      const suggestion = possible.length === 1 ? possible[0] : undefined;
      return { source, matches: suggestion && confirmed[source.column] === suggestion.question.externalId ? [suggestion] : [], matrixMatch: false, suggestion };
    }
    const label = source.question.question.slice(separator + 2).trim();
    const truncated = /(?:\.{3}|…)\s*$/.test(label);
    const fragment = normalized(label.replace(/(?:\.{3}|…)\s*$/, ""));
    if (!fragment || (truncated && fragment.length < 20)) return { source, matches: [], matrixMatch: false };
    const matches = targets.filter(({ question }) => question.sourceContext?.matrix && (truncated ? normalized(question.text).startsWith(fragment) : normalized(question.text) === fragment));
    return { source, matches, matrixMatch: true };
  });
  const selected: ConfigRow[] = [];
  const selectedIds: string[] = [];
  const existingIds: string[] = [];
  const rows = candidates.map(({ source, matches, matrixMatch, suggestion }) => {
    const { question: input } = source;
    let status = "Lista para cargar";
    const match = matches[0];
    const target = match?.question;
    if (!matches.length) status = suggestion ? "Coincidencia sugerida; confirmar" : "Sin coincidencia en el formulario";
    else if (matches.length > 1 || candidates.filter(item => item.matches.some(value => value.question.externalId === target!.externalId)).length > 1) status = "Coincidencia ambigua; revisar";
    else if (protectedIds.includes(target!.externalId) || target!.setupReviewed) status = "Ya configurada; se conserva";
    else if (input.exclude) status = "Post Only: requiere revisión";
    else if (source.warnings.length) status = source.warnings.join(" ");
    else if (input.type !== "informativa" && expectedType[input.type] !== target!.type && !(input.type === "frequency" && target!.type === "LIKERT" && target!.sourceContext?.matrix)) status = "Tipo de respuesta diferente";
    else if (input.maxScore !== null && input.maxScore < 0) status = "Puntaje máximo negativo; revisar";
    else if (input.type === "one_answer" && (!input.correctAnswer || !target!.options.includes(input.correctAnswer))) status = "Respuesta correcta no coincide con el formulario";
    else if (source.options.some(Boolean) && JSON.stringify(source.options.filter(Boolean)) !== JSON.stringify(target!.options)) status = "Opciones diferentes; revisar";
    const matchingCategories = categories.filter(item => item.isActive && item.subcategory && input.subcategory && normalized(item.subcategory) === normalized(input.subcategory));
    const automaticCategories = [...new Map(matchingCategories.map(item => [JSON.stringify([item.name, item.subcategory]), item])).values()];
    const categoryKey = assessmentCategoryKey(input.subcategory, source.column);
    const needsCategoryChoice = input.type !== "informativa" && automaticCategories.length !== 1;
    const manualCategory = categories.find(item => item.id === selectedCategories[categoryKey] && item.isActive && item.subcategory);
    const distinctCategories = needsCategoryChoice && manualCategory ? [manualCategory] : automaticCategories;
    if (status === "Ya configurada; se conserva" && !target!.setupReviewed && input.type !== "informativa" && !input.exclude && !source.warnings.length && distinctCategories.length === 1) {
      const rule = target!.analysisScoring?.find(item => item.analysisType === "pre_post");
      const category = distinctCategories[0]!;
      const optionsMatch = JSON.stringify(source.options.filter(Boolean)) === JSON.stringify(target!.options);
      const ruleMatches = rule?.maxScore === input.maxScore && (input.type === "one_answer" ? target!.type === "ONE_ANSWER" && rule.correctAnswer === input.correctAnswer : ["LIKERT", "FREQUENCY"].includes(target!.type) && rule.scoringMode === "ordered_scale" && !rule.inverse);
      if (target!.role === "SCORED" && target!.classification?.category === category.name && target!.classification?.subcategory === category.subcategory && optionsMatch && ruleMatches && assistantScoringReady([target!], "pre_post")) {
        existingIds.push(target!.externalId);
        status = "Configuración coincidente; marcar revisada";
      }
    }
    if (status === "Lista para cargar" && input.type !== "informativa" && distinctCategories.length !== 1) status = "Subcategoría ausente o ambigua en el catálogo";
    if (status === "Lista para cargar") {
      const row: ConfigRow = { ...targetRows[match!.index]! };
      if (input.type === "frequency") row["Tipo de respuesta"] = responseTypes.FREQUENCY;
      row["Rol de la pregunta"] = input.type === "informativa" ? "Informativa" : "Evaluable";
      row["Usar como filtro"] = "No";
      if (input.type !== "informativa") {
        const category = distinctCategories[0]!;
        row["Subcategoría"] = categoryLabel(category.name, category.subcategory!);
        row["Método de puntuación"] = input.type === "one_answer" ? "Respuesta correcta" : "Escala";
        row["Puntaje máximo"] = String(input.maxScore);
        row["Respuesta correcta"] = input.correctAnswer ?? "";
        row["Puntuación inversa"] = "No";
        row["Peso categoría (%)"] = ""; row["Peso subcategoría (%)"] = "";
      }
      selected.push(row);
      selectedIds.push(target!.externalId);
    }
    return { id: source.column, question: input.question, matchedQuestion: matches.length === 1 ? target!.text : suggestion?.question.text ?? null, suggestedId: suggestion?.question.externalId ?? null, type: input.type, subcategory: input.subcategory, categoryKey, needsCategoryChoice, maximum: input.maxScore, correct: input.correctAnswer, scaleDirection: input.type === "likert" || input.type === "frequency" ? "Normal" : null, postOnly: input.exclude, status: status === "Lista para cargar" && matrixMatch ? "Lista para cargar; revisar fila de matriz" : status };
  });
  const result = selected.length ? previewInstrumentTable(selected, draft, questions, categories, selected) : null;
  const applied = new Set([...existingIds, ...selectedIds.filter((_, index) => result?.matches[index]?.status === "Compatible")]);
  const imported = result?.draft ?? (!selected.length && existingIds.length ? { ...draft, questions: [...questions] } : null);
  if (imported?.questions) {
    const complete = imported.questions.map(question => ({ ...visible.find(source => source.externalId === question.externalId), ...question })) as ConfigQuestion[];
    imported.questions = imported.questions.map(question => {
      if (!applied.has(question.externalId) || question.role !== "SCORED") return question;
      const current = complete.find(item => item.externalId === question.externalId)!;
      const source = visible.find(item => item.externalId === question.externalId);
      const issue = questionSetupIssue(current, complete, categories, categories[0]?.organizationId ?? null, false, source);
      return { ...question, setupReviewed: !issue && assistantScoringReady([current], "pre_post") };
    });
  }
  return { rows, count: selected.length + existingIds.length, draft: imported ?? null, errors: result?.errors ?? [] };
}
