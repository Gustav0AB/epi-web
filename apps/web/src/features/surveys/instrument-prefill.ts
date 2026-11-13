import { AnalysisWeightsSchema, SurveySetupQuestionSchema, type CategoryDto, type SurveySetupDraft } from "@epi/shared";
import { instrumentConfigRows, previewInstrumentTable, type ConfigQuestion } from "./instrument-config-table";

const normalize = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
type Source = { analysisWeights: unknown; questions: unknown[] };

export function prefillPreview(draft: SurveySetupDraft, questions: ConfigQuestion[], categories: CategoryDto[], source: Source, protectedIds: string[] = []) {
  const parsedWeights = AnalysisWeightsSchema.safeParse(source.analysisWeights);
  const origins = source.questions.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const parsed = SurveySetupQuestionSchema.safeParse(item);
    return parsed.success && Array.isArray(item.options) && item.options.every(option => typeof option === "string")
      ? [{ ...parsed.data, options: item.options as string[] }] : [];
  });
  const sourceDraft = { ...draft, analysisWeights: parsedWeights.success ? parsedWeights.data : [] };
  const sourceRows = instrumentConfigRows(sourceDraft, origins).rows;
  const visibleOrigins = origins.filter(item => !item.sourceContext?.matrixParent);
  const visible = questions.filter(item => !item.sourceContext?.matrixParent);
  const candidates = visible.map(target => {
    const same = visibleOrigins.flatMap((origin, index) => normalize(origin.text) === normalize(target.text) && origin.type === target.type && JSON.stringify(origin.options) === JSON.stringify(target.options) ? [index] : []);
    return { target, same };
  });
  const selectedRows: typeof sourceRows = [];
  const matches = candidates.map(({ target, same }) => {
    const shared = same.length === 1 && candidates.filter(candidate => candidate.same.includes(same[0]!)).length > 1;
    const status = protectedIds.includes(target.externalId) || target.setupReviewed ? "Ya configurada; se conserva" : !same.length ? "Sin coincidencia compatible" : same.length > 1 || shared ? "Ambigua; revisar manualmente" : "Compatible";
    if (status === "Compatible") selectedRows.push(sourceRows[same[0]!]!);
    return { externalId: target.externalId, text: target.text, status };
  });
  const preview = selectedRows.length ? previewInstrumentTable(selectedRows, draft, questions, categories) : null;
  return { count: selectedRows.length, total: visible.length, matches, draft: preview?.draft ?? null, errors: preview?.errors.map(error => error.message) ?? [] };
}
