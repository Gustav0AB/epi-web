import { z } from "zod";
import type { PaginationMeta } from "../types/api.types.js";

// Estados de una submission (deben coincidir con el enum SubmissionStatus de Prisma).
export const SUBMISSION_STATUSES = [
  "PROCESADO",
  "PENDIENTE_CONFIGURACION",
  "COMPLETADO",
  "ERROR",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SURVEY_MOMENTS = ["PRE", "POST", "POST_POST", "CQS", "UNKNOWN"] as const;
export type SurveyMoment = (typeof SURVEY_MOMENTS)[number];

// Tipos de pregunta (deben coincidir con el enum QuestionType de Prisma).
export const QUESTION_TYPES = ["LIKERT", "ONE_ANSWER", "FREQUENCY", "OPEN_TEXT"] as const;
export type QuestionTypeValue = (typeof QUESTION_TYPES)[number];

// String opcional tolerante: undefined/null/"" → null; recorta lo demás.
// Sirve tanto para JSON (undefined) como para CSV (celdas vacías "").
const optionalTrimmed = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

// maxScore desde JSON (number) o CSV (string). Celda vacía → NaN → rechazado.
const scoreField = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? NaN : Number(v)) : v),
  z.number({ invalid_type_error: "maxScore es requerido y numérico" }).finite().min(0)
);

// Ponderación de una pregunta (manual o desde una fila del CSV).
export const WeightInputSchema = z.object({
  factor: z.preprocess((value) => typeof value === "string" ? (value.trim() ? Number(value) : undefined) : value, z.number().int().min(1).max(10).optional()),
  category: z.string().trim().min(1, "category es requerido"),
  subcategory: optionalTrimmed,
  maxScore: scoreField,
  correctAnswer: optionalTrimmed,
});
export type WeightInput = z.infer<typeof WeightInputSchema>;

// Asociar un formID de Jotform desconocido a un sitio/tipo — crea la
// SurveyDefinition (v1) y sus preguntas a partir de lo ya recibido.
export const QUESTION_ROLES = ["SCORED", "INFORMATIONAL", "IDENTIFIER", "MOMENT", "FILTER", "SCHOOL_GROUP", "ACTIVITY", "GENDER", "AGE", "EXCLUDED"] as const;
export const MomentMappingSchema = z.array(z.object({
  value: z.string().trim().min(1).max(1000),
  moment: z.enum(["PRE", "POST", "POST_POST"]),
})).max(500).refine((mappings) => new Set(mappings.map((mapping) => mapping.value)).size === mappings.length, "Duplicate moment options");
export const SurveySetupWeightSchema = WeightInputSchema.extend({
  category: z.string().trim().max(200),
  maxScore: scoreField.nullable(),
});
export const OptionLabelsSchema = z.array(z.object({ value: z.string().trim().min(1).max(1000), label: z.string().trim().min(1).max(200) })).max(500).refine((labels) => new Set(labels.map((item) => item.value)).size === labels.length, "Duplicate option labels");
export type SurveyFilterField = { id: string; label: string; options: { value: string; label: string }[] };
export const ANALYSIS_TYPES = ["pre_post", "pre_post_post"] as const;
export type AnalysisType = typeof ANALYSIS_TYPES[number];
export const QuestionAnalysisParticipationSchema = z.array(z.object({
  analysisType: z.enum(ANALYSIS_TYPES),
  enabled: z.boolean(),
}).strict()).length(2).refine(items => new Set(items.map(item => item.analysisType)).size === items.length, "Duplicate analysis participation");
export type QuestionAnalysisParticipation = z.infer<typeof QuestionAnalysisParticipationSchema>;
export const AnalysisOptionScoresSchema = z.array(z.object({
  value: z.string().trim().min(1).max(1000),
  score: scoreField.nullable(),
  excluded: z.boolean().optional(),
}).strict()).max(500).refine(items => new Set(items.map(item => item.value)).size === items.length, "Duplicate option scores");
export const AnalysisNumericRangeSchema = z.object({
  minimum: z.number().finite().nullable(),
  maximum: z.number().finite().nullable(),
  direction: z.enum(["direct", "reverse"]).nullable(),
}).strict();
export type AnalysisNumericRange = z.infer<typeof AnalysisNumericRangeSchema>;
export const AnalysisResponsePolicySchema = z.object({
  blank: z.literal("exclude").nullable(),
  invalid: z.literal("review").nullable(),
}).strict();
export type AnalysisResponsePolicy = z.infer<typeof AnalysisResponsePolicySchema>;
export const QuestionAnalysisScoringSchema = z.array(z.object({
  analysisType: z.enum(ANALYSIS_TYPES),
  maxScore: scoreField.nullable(),
  correctAnswer: optionalTrimmed,
  scoringMode: z.enum(["standard", "option_scores", "numeric_range", "ordered_scale"]).optional(),
  inverse: z.boolean().optional(),
  excludedOptions: z.array(z.string().trim().min(1).max(1000)).max(500).refine(items => new Set(items).size === items.length, "Duplicate excluded options").optional(),
  scaleOptions: z.array(z.string().trim().min(1).max(1000)).max(500).optional(),
  numericRange: AnalysisNumericRangeSchema.optional(),
  responsePolicy: AnalysisResponsePolicySchema.nullable().optional(),
  optionScores: AnalysisOptionScoresSchema.optional(),
}).strict()).max(2).refine(items => new Set(items.map(item => item.analysisType)).size === items.length, "Duplicate analysis scoring");
export const QuestionClassificationSchema = z.object({ category: z.string().trim().max(200), subcategory: optionalTrimmed }).strict();
export const QuestionSourceContextSchema = z.object({
  section: z.object({ externalId: z.string(), text: z.string() }).strict().optional(),
  matrixParent: z.boolean().optional(),
  matrix: z.object({ externalId: z.string(), text: z.string(), rowKey: z.string(), rowIndex: z.number().int().min(0), rowLabel: z.string(), qid: z.string().optional() }).strict().optional(),
}).strict();
export const SurveySetupQuestionSchema = z.object({
  setupReviewed: z.boolean().optional(),
  sourceContext: QuestionSourceContextSchema.nullable().optional(),
  matrixOverride: z.boolean().optional(),
  classification: QuestionClassificationSchema.nullable().optional(),
  analysisScoring: QuestionAnalysisScoringSchema.nullable().optional(),
  analysisParticipation: QuestionAnalysisParticipationSchema.nullable().optional(),
  isFilter: z.boolean().optional(),
  optionLabels: OptionLabelsSchema.optional(),
  weight: SurveySetupWeightSchema.nullable().optional(),
  role: z.enum(QUESTION_ROLES).optional(),
  momentMappings: MomentMappingSchema.optional(),
  externalId: z.string().trim().min(1).max(255),
  text: z.string().trim().min(1).max(5000),
  type: z.enum(QUESTION_TYPES),
});
export type SurveySetupQuestion = z.infer<typeof SurveySetupQuestionSchema>;
export const CategoryWeightSettingSchema = z.object({ category: z.string().trim().min(1).max(200), weight: z.number().finite().min(0).max(100).nullable() });
export const SubcategoryWeightSettingSchema = CategoryWeightSettingSchema.extend({ subcategory: z.string().trim().min(1).max(200) });
export type CategoryWeightSetting = z.infer<typeof CategoryWeightSettingSchema>;
export type SubcategoryWeightSetting = z.infer<typeof SubcategoryWeightSettingSchema>;
export const AnalysisWeightsSchema = z.array(z.object({
  standardDeviation: z.enum(["disabled", "sample", "population"]).optional(),
  analysisType: z.enum(ANALYSIS_TYPES),
  categoryWeights: z.array(CategoryWeightSettingSchema).max(200).refine(items => new Set(items.map(item => item.category)).size === items.length, "Duplicate category weights"),
  subcategoryWeights: z.array(SubcategoryWeightSettingSchema).max(500).refine(items => new Set(items.map(item => JSON.stringify([item.category, item.subcategory]))).size === items.length, "Duplicate subcategory weights"),
}).strict()).max(2).refine(items => new Set(items.map(item => item.analysisType)).size === items.length, "Duplicate analysis weights");
export type AnalysisWeights = z.infer<typeof AnalysisWeightsSchema>;
export const INSTRUMENT_KINDS = ["LEARNING", "FOLLOW_UP", "CQS"] as const;
export const MatrixDefaultsSchema = z.array(SurveySetupQuestionSchema.pick({ externalId: true, role: true, classification: true, analysisParticipation: true, analysisScoring: true })).max(100).refine(items => items.every(item => item.role === undefined || ["SCORED", "INFORMATIONAL", "EXCLUDED"].includes(item.role)), "Matrix defaults support evaluable, informational or excluded roles").refine(items => new Set(items.map(item => item.externalId)).size === items.length, "Duplicate matrix defaults");
export type MatrixDefaults = z.infer<typeof MatrixDefaultsSchema>;
export const SurveySetupDraftSchema = z.object({
  configurationMode: z.literal("instrument").optional(),
  baseDefinitionId: z.string().uuid().nullable().optional(),
  matrixDefaults: MatrixDefaultsSchema.optional(),
  analysisWeights: AnalysisWeightsSchema.optional(),
  categoryWeights: z.array(CategoryWeightSettingSchema).max(200).refine(items => new Set(items.map(item => item.category)).size === items.length, "Duplicate category weights").optional(),
  subcategoryWeights: z.array(SubcategoryWeightSettingSchema).max(500).refine(items => new Set(items.map(item => JSON.stringify([item.category, item.subcategory]))).size === items.length, "Duplicate subcategory weights").optional(),
  scoringWeightsVersion: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  programName: z.string().trim().max(100).optional(),
  instrumentKind: z.enum(INSTRUMENT_KINDS).optional(),
  description: z.string().trim().max(2000).optional(),
  timeZone: z.string().trim().max(100).refine((value) => {
    if (!value) return true; // Incomplete drafts and legacy instruments have no assigned zone.
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Invalid time zone").optional(),
  siteId: z.string().uuid().nullable(),
  type: z.enum(["LOCAL", "VISITING", "OTHER"]),
  instrumentName: z.string().trim().max(100).transform((value) => value.replace(/\s+/g, " ")),
  activityName: z.string().trim().max(100).transform((value) => value.replace(/\s+/g, " ")),
  activityType: z.string().trim().max(100).transform((value) => value.replace(/\s+/g, " ")).optional(),
  questions: z.array(SurveySetupQuestionSchema).max(500).refine(
    (questions) => new Set(questions.map((question) => question.externalId)).size === questions.length,
    "Duplicate question identifiers",
  ).refine((questions) => questions.filter((question) => question.role === "IDENTIFIER").length <= 1,
    "Only one participant identifier is allowed",
  ).refine((questions) => questions.filter((question) => question.role === "MOMENT").length <= 1,
    "Only one moment question is allowed",
  ).refine((questions) => questions.filter((question) => question.role === "SCHOOL_GROUP").length <= 1,
    "Only one school/group question is allowed",
  ).refine((questions) => questions.filter((question) => question.role === "ACTIVITY").length <= 1,
    "Only one activity question is allowed",
  ).refine(questions => ["GENDER", "AGE"].every(role => questions.filter(question => question.role === role).length <= 1), "Solo se permite una pregunta por contexto demográfico").optional(),
}).refine(draft => draft.scoringWeightsVersion === 2 || draft.scoringWeightsVersion === 3 || draft.scoringWeightsVersion === 4 || (draft.categoryWeights === undefined && draft.subcategoryWeights === undefined), {
  message: "Las tablas de ponderación requieren scoringWeightsVersion=2, 3 o 4",
  path: ["scoringWeightsVersion"],
}).refine(draft => (draft.scoringWeightsVersion !== 3 && draft.scoringWeightsVersion !== 4) || draft.analysisWeights !== undefined, { message: "La configuración por análisis requiere analysisWeights explícito", path: ["analysisWeights"] });
export const SaveSurveySetupSchema = z.object({
  revision: z.number().int().min(0),
  draft: SurveySetupDraftSchema,
});
export type SurveySetupDraft = z.infer<typeof SurveySetupDraftSchema>;
export type SaveSurveySetupInput = z.infer<typeof SaveSurveySetupSchema>;
export type SurveySetupDto = {
  activeVersion?: { id: string; version: number; draft: SurveySetupDraft };
  draft: SurveySetupDraft;
  revision: number;
  options: { kind: "INSTRUMENT" | "ACTIVITY" | "ACTIVITY_TYPE"; name: string }[];
};

export const RegisterDefinitionSchema = z.object({
  jotformFormId: z.string().trim().min(1),
  setupRevision: z.number().int().min(0).optional(),
  baseDefinitionId: z.string().uuid().optional(),
  siteId: z.string().trim().min(1),
  type: z.enum(["LOCAL", "VISITING", "OTHER"]),
});
export type RegisterDefinitionInput = z.infer<typeof RegisterDefinitionSchema>;

export const UpdateQuestionSchema = z.object({
  text: z.string().trim().min(1).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
});
export type UpdateQuestionInput = z.infer<typeof UpdateQuestionSchema>;

export const UpdateOpenQuestionsSummarySchema = z.object({
  summary: z.string(),
});
export type UpdateOpenQuestionsSummaryInput = z.infer<typeof UpdateOpenQuestionsSummarySchema>;

export const HistoricalSubmissionsQuerySchema = z.object({
  surveyDefinitionIds: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
});
export type HistoricalSubmissionsQuery = z.infer<typeof HistoricalSubmissionsQuerySchema>;

export const HistoricalSubmissionsImportSchema = z.object({
  surveyDefinitionIds: z.array(z.string().trim().min(1)).min(1),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  submissionIds: z.array(z.string().trim().min(1)).optional(),
});
export type HistoricalSubmissionsImportInput = z.infer<typeof HistoricalSubmissionsImportSchema>;

// "true"/"false" en query params → boolean.
const queryBool = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// Filtros del listado de encuestas (query params del GET /api/surveys).
export const SurveyFiltersSchema = z.object({
  questionId: z.string().uuid().optional(),
  answerValue: z.string().min(1).max(1000).optional(),
  groupName: z.string().trim().min(1).optional(),
  surveyDefinitionId: z.string().trim().min(1).optional(),
  siteId: z.string().trim().min(1).optional(),
  type: z.enum(["LOCAL", "VISITING", "OTHER"]).optional(),
  school: z.string().trim().min(1).optional(),
  isPre: queryBool, // true = pre-actividad, false = post
  surveyMoment: z.enum(SURVEY_MOMENTS).optional(),
  status: z.enum(SUBMISSION_STATUSES).optional(),
  from: z.string().trim().min(1).optional(), // fecha ISO (>= receivedAt)
  to: z.string().trim().min(1).optional(), // fecha ISO (<= receivedAt)
  weightedOnly: queryBool,
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).refine((filters) => !!filters.questionId === (filters.answerValue !== undefined), "questionId and answerValue must be provided together");
export type SurveyFilters = z.infer<typeof SurveyFiltersSchema>;

export const SurveyGroupSearchSchema = z.object({
  entryType: z.enum(["courses", "individual"]).optional(),
  reviewStatus: z.enum(["REVIEWED", "COMPLETED", "PENDING", "ERROR"]).optional(),
  questionId: z.string().uuid().optional(),
  answerValue: z.string().optional(),
  siteId: z.string().uuid().optional(),
  surveyDefinitionId: z.string().uuid().optional(),
  from: z.string().trim().date().optional(),
  to: z.string().trim().date().optional(),
}).refine(value => !!value.questionId === (value.answerValue !== undefined), "questionId and answerValue must be provided together").refine((range) => !range.from || !range.to || range.from <= range.to, { message: "from must not be after to", path: ["to"] });
export type SurveyGroupSearch = z.infer<typeof SurveyGroupSearchSchema>;

// Filtros del dashboard de reportes (solo encuestas COMPLETADO).
export const ReportFiltersSchema = z.object({
  courseDate: z.string().date().optional(),
  excludedQuestionIds: z.preprocess((value) => typeof value === "string" ? value.split(",") : value, z.array(z.string().uuid()).max(200).optional()),
  surveyDefinitionId: z.string().trim().min(1).optional(),
  siteId: z.string().trim().min(1).optional(),
  type: z.enum(["LOCAL", "VISITING", "OTHER"]).optional(),
  school: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  from: z.string().trim().min(1).optional(), // fecha ISO (>= receivedAt)
  to: z.string().trim().min(1).optional(), // fecha ISO (<= receivedAt)
}).refine((value) => !value.courseDate || Boolean(value.siteId && value.school), { message: "Course date requires site and school", path: ["courseDate"] });
export type ReportFilters = z.infer<typeof ReportFiltersSchema>;

// Columnas de la plantilla CSV de ponderaciones. Única fuente de verdad:
// el frontend genera la plantilla con estas columnas y el backend las parsea.
export const WEIGHT_CSV_COLUMNS = [
  "externalId",
  "text",
  "type",
  "category",
  "subcategory",
  "maxScore",
  "correctAnswer",
  "factor",
] as const;
export type WeightCsvColumn = (typeof WEIGHT_CSV_COLUMNS)[number];

// ── Tipos de respuesta (contratos API consumidos por el frontend) ──────

export type WeightDto = {
  factor?: number;
  category: string;
  subcategory: string | null;
  maxScore: number;
  correctAnswer: string | null;
};

export type SurveyDefinitionDto = {
  configurationVersion?: number | null;
  instrumentKind?: string | null;
  id: string;
  siteId: string;
  jotformFormId: string;
  type: string;
  version: number;
  title: string;
  organizationId: string | null;
  accountName: string | null;
  isWeighted: boolean;
  openQuestionsSummary: string | null;
};

export type QuestionWithWeight = {
  sourceContext?: z.infer<typeof QuestionSourceContextSchema> | null;
  matrixOverride?: boolean;
  classification?: SurveySetupQuestion["classification"];
  analysisScoring?: SurveySetupQuestion["analysisScoring"];
  analysisParticipation?: SurveySetupQuestion["analysisParticipation"];
  isFilter?: boolean;
  visibility?: QuestionVisibility | null;
  role?: "SCORED" | "INFORMATIONAL" | "IDENTIFIER" | "MOMENT" | "FILTER" | "SCHOOL_GROUP" | "ACTIVITY" | "GENDER" | "AGE" | "EXCLUDED";
  id: string;
  externalId: string;
  text: string;
  type: string;
  options: string[];
  weight: WeightDto | null;
  answers: string[];
};

export type SurveyListItem = {
  id: string;
  status: SubmissionStatus;
  isPre: boolean | null;
  surveyMoment: SurveyMoment;
  receivedAt: string;
  processedAt: string | null;
  processingError: string | null;
  isDuplicate: boolean;
  participant: { name: string | null; groupName: string | null; school: string | null } | null;
  surveyDefinition: { id: string; jotformFormId: string; type: string; siteId: string } | null;
};

// Formulario de Jotform que llegó pero no coincide con ninguna SurveyDefinition.
export type UnregisteredFormDto = {
  jotformFormId: string;
  count: number;
  firstReceivedAt: string;
  sampleExternalIds: string[];
};

// Catálogo local de formularios de la cuenta de Jotform (GET /user/forms
// cacheado) — `registered` indica si ya tiene una SurveyDefinition.
export type JotformFormDto = {
  createdAt: string | null;
  updatedAt: string | null;
  submissionCount: number | null;
  lastSubmission: string | null;
  url: string | null;
  labelIds: string[];
  id: string;
  title: string;
  status: string;
  registered: boolean;
  hasDraft?: boolean;
  accountName: string | null;
  syncedAt: string;
};

export const JotformFormsQuerySchema = z.object({
  registered: z.enum(["true", "false"]).optional(),
  labelId: z.string().trim().min(1).max(200).optional(),
  withoutLabels: z.enum(["true"]).optional(),
  accountId: z.string().uuid().optional(),
  search: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine(value => !value.labelId || Boolean(value.accountId), { message: "Label filter requires accountId", path: ["accountId"] }).refine(value => !(value.labelId && value.withoutLabels), { message: "Choose labelId or withoutLabels", path: ["labelId"] });
export type JotformFormsQuery = z.infer<typeof JotformFormsQuerySchema>;
export type JotformFormsPage = { forms: JotformFormDto[]; meta: PaginationMeta };

export type JotformFormsSyncResult = { added: string[]; total: number };

export type HistoricalSubmissionDto = {
  id: string;
  formId: string;
  formTitle: string;
  createdAt: string;
  alreadyImported: boolean;
};

export type HistoricalImportResult = {
  imported: number;
  skipped: number;
  processed: number;
  pending: number;
  errors: number;
};

export const CreateJotformAccountSchema = z.object({
  name: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  excludedLabelIds: z.array(z.string().trim().min(1).max(255)).max(500).default([]),
});
export const JotformAccountLabelsSchema = z.object({ excludedLabelIds: z.array(z.string().trim().min(1).max(255)).max(500) });
export type CreateJotformAccountInput = z.infer<typeof CreateJotformAccountSchema>;

export type JotformAccountDto = {
  id: string;
  name: string;
  apiKeyPreview: string;
  excludedLabelIds: string[];
  createdAt: string;
};

// Preview de GET /form/:id/questions ya separado en preguntas ponderables
// vs. campos de catálogo (CATALOG_DATA) — antes de dar de alta la encuesta.
export type QuestionVisibility = { hidden: boolean; rules: { id: string; action: string; link: string; terms: { field: string; operator: string; value: string }[]; raw: string }[] };
export type FormQuestionPreview = { sourceContext?: z.infer<typeof QuestionSourceContextSchema>; isFilter?: boolean; visibility?: QuestionVisibility; controlType?: string; role?: "SCORED" | "INFORMATIONAL" | "IDENTIFIER" | "MOMENT" | "FILTER" | "SCHOOL_GROUP" | "ACTIVITY" | "GENDER" | "AGE" | "EXCLUDED"; externalId: string; text: string; type: QuestionTypeValue; options: string[] };
export type CatalogMatchPreview = { key: string; label: string; options: string[] };
export type FormQuestionsPreviewDto = {
  conditionWarnings?: string[];
  conditionSource?: string;
  scoredQuestions: FormQuestionPreview[];
  catalogMatches: CatalogMatchPreview[];
  skipped: { externalId: string; type: string; text?: string; reason?: string; visibility?: QuestionVisibility }[];
};

// Catálogo de campos-dimensión (Grupo/Grado/Tipo de Programa/Edad…).
export type CatalogFieldDto = {
  id: string;
  key: string;
  label: string;
  options: string[];
};

export type ReprocessPendingResult = {
  reprocessed: number;
  stillPending: number;
  errors: number;
};

export type WeightImportResult = {
  applied: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

// Resumen por grupo/escuela para el flujo de completado pre/post.
export type GroupSummary = {
  groupName: string;
  preCount: number;
  postCount: number;
  cqsCount: number;
  students: number; // participantes distintos
  blanks: number; // respuestas en blanco (no cuentan para el cálculo)
  completed: boolean; // todas sus submissions ya están COMPLETADO
  canComplete: boolean; // tiene pre y post procesados
};

export const CourseExpectationSchema = z.object({
  siteId: z.string().uuid(),
  school: z.string().trim().min(1).max(500),
  date: z.string().date(),
  expectedParticipants: z.number().int().min(1).max(1000000).nullable(),
});
export const CourseDetailSchema = CourseExpectationSchema.omit({ expectedParticipants: true }).extend({ surveyDefinitionId: z.string().uuid().optional(), groupId: z.string().max(2000).optional() });
export type CourseDetailQuery = z.infer<typeof CourseDetailSchema>;
export const SubmissionMomentReviewSchema = z.object({ moment: z.enum(["PRE", "POST", "POST_POST", "CQS"]).nullable(), expectedRevision: z.number().int().min(0).optional() });

export const SubmissionExclusionSchema = z.object({ excluded: z.boolean(), expectedRevision: z.number().int().min(0).optional() });

export const SubmissionContextReviewSchema = z.object({
  expectedRevision: z.number().int().min(0),
  context: z.object({ school: z.string().trim().min(1).max(200), date: z.string().date(), activity: z.string().trim().max(200).nullable().optional(), gender: z.string().trim().max(200).nullable().optional(), age: z.number().int().min(0).max(2147483647).nullable().optional() }).nullable(),
});
export type SubmissionContextReviewInput = z.infer<typeof SubmissionContextReviewSchema>;

export const SchoolContextSchema = z.object({
  original: z.string().nullable(),
  school: z.string().nullable(),
  extractedDate: z.string().date().nullable(),
  needsReview: z.boolean(),
  originalSubmittedAt: z.string().nullable().default(null),
  groupingDate: z.string().date().nullable().default(null),
  dateSource: z.enum(["school_field", "submitted_at"]).nullable().default(null),
  timeZone: z.string().nullable().default(null),
});
export type SchoolContextDto = z.infer<typeof SchoolContextSchema>;

export const ActivityContextSchema = z.object({
  original: z.string().nullable(),
  activity: z.string().nullable(),
  needsReview: z.boolean(),
});
export type ActivityContextDto = z.infer<typeof ActivityContextSchema>;
export type CourseSubmissionDto = {
  savedForCourse?: boolean;
  activityContext: ActivityContextDto | null;
  contextRevision: number;
  confirmedContext: { school: string; date: string; activity: string | null; gender?: string | null; age?: number | null } | null;
  schoolContext: SchoolContextDto | null;
  reviewMoment: SurveyMoment | null;
  reviewExcluded: boolean;
  processingError: string | null;
  id: string;
  jotformSubmissionId: string;
  receivedAt: string;
  surveyMoment: SurveyMoment;
  status: SubmissionStatus;
  isDuplicate: boolean;
  participantName: string | null;
  answers: { questionId: string; text: string; value: string }[];
};
export type CourseExpectationInput = z.infer<typeof CourseExpectationSchema>;

export type SurveyGroupSearchRow = {
  isOpenPublic?: boolean; courseId?: string; courseStatus?: "REVIEWED" | "COMPLETED"; courseName?: string; confirmedParticipants?: number | null; dates?: string[];
  versioned?: boolean; savedCount?: number; contextNeedsReview?: boolean;
  meetsResponseCoverage: boolean;
  excludedCount: number;
  pendingCount: number;
  errorCount: number;
  manualExpectedParticipants: number | null;
  siteId: string | null;
  expectedParticipants: number;
  preResponsePercent: number | null;
  postResponsePercent: number | null;
  cqsResponsePercent: number | null;
  id: string;
  school: string;
  date: string;
  studentsResponded: number;
  manager: string | null;
  preCount: number;
  postCount: number;
  cqsCount: number;
  improvementPercent: number | null;
};

export type SurveyGroupSearchResult = {
  totalGroups: number;
  rows: SurveyGroupSearchRow[];
};

// Fila del dashboard de reportes: % pre, % post y cambio por subcategoría.
export type ReportRow = {
  category: string;
  subcategory: string | null;
  pre: number | null; // % promedio (0-100) de encuestas pre
  post: number | null; // % promedio (0-100) de encuestas post
  change: number | null; // relative change in percent
};

export type ReportDetail = {
  overallImprovement: number | null;
  total: ReportRow;
  categories: ReportRow[];
  questions: (ReportRow & { questionId: string; text: string; preCount: number; postCount: number; excluded: boolean; comparable: boolean })[];
};

export const CoursePublicationKeySchema = CourseExpectationSchema.omit({ expectedParticipants: true });
export const PublishCourseSchema = CoursePublicationKeySchema.extend({
  expectedVersion: z.number().int().min(0),
  excludedQuestionIds: z.array(z.string().uuid()).max(200).default([]),
});
export type PublishCourseInput = z.infer<typeof PublishCourseSchema>;

export type JotformLabelDto = { id: string; name: string };
export const JotformLabelsQuerySchema = z.object({ accountId: z.string().uuid() });


export type SchoolCatalogDto = {
  schools: { siteId: string; siteName: string; name: string; responseCount: number; confirmedCount: number }[];
  unresolvedCount: number;
};

export const AssistantSyncSettingsSchema = z.object({ autoSync: z.boolean() }).strict();

export type AssistantMigrationProgress = {
  autoSync?: boolean;
  autoAttempts?: number;
  nextAttemptAt?: string | null;
  phase?: "DOWNLOADING" | "PROCESSING";
  definitionId: string;
  status: string;
  total: number;
  updated: number;
  pending: number;
  errors: number;
  skipped: number;
};
