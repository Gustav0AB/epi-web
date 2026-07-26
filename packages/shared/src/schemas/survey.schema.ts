import { z } from "zod";

// Estados de una submission (deben coincidir con el enum SubmissionStatus de Prisma).
export const SUBMISSION_STATUSES = [
  "PROCESADO",
  "PENDIENTE_CONFIGURACION",
  "COMPLETADO",
  "ERROR",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

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
  z.number({ invalid_type_error: "maxScore es requerido y numérico" }).min(0)
);

// Ponderación de una pregunta (manual o desde una fila del CSV).
export const WeightInputSchema = z.object({
  category: z.string().trim().min(1, "category es requerido"),
  subcategory: optionalTrimmed,
  maxScore: scoreField,
  correctAnswer: optionalTrimmed,
});
export type WeightInput = z.infer<typeof WeightInputSchema>;

// Asociar un formID de Jotform desconocido a un sitio/tipo — crea la
// SurveyDefinition (v1) y sus preguntas a partir de lo ya recibido.
export const RegisterDefinitionSchema = z.object({
  jotformFormId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  type: z.enum(["LOCAL", "VISITING"]),
});
export type RegisterDefinitionInput = z.infer<typeof RegisterDefinitionSchema>;

export const UpdateQuestionSchema = z.object({
  text: z.string().trim().min(1).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
});
export type UpdateQuestionInput = z.infer<typeof UpdateQuestionSchema>;

// "true"/"false" en query params → boolean.
const queryBool = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// Filtros del listado de encuestas (query params del GET /api/surveys).
export const SurveyFiltersSchema = z.object({
  groupName: z.string().trim().min(1).optional(),
  surveyDefinitionId: z.string().trim().min(1).optional(),
  siteId: z.string().trim().min(1).optional(),
  type: z.enum(["LOCAL", "VISITING"]).optional(),
  school: z.string().trim().min(1).optional(),
  isPre: queryBool, // true = pre-actividad, false = post
  status: z.enum(SUBMISSION_STATUSES).optional(),
  from: z.string().trim().min(1).optional(), // fecha ISO (>= receivedAt)
  to: z.string().trim().min(1).optional(), // fecha ISO (<= receivedAt)
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type SurveyFilters = z.infer<typeof SurveyFiltersSchema>;

// Filtros del dashboard de reportes (solo encuestas COMPLETADO).
export const ReportFiltersSchema = z.object({
  siteId: z.string().trim().min(1).optional(),
  type: z.enum(["LOCAL", "VISITING"]).optional(),
  school: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
});
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
] as const;
export type WeightCsvColumn = (typeof WEIGHT_CSV_COLUMNS)[number];

// ── Tipos de respuesta (contratos API consumidos por el frontend) ──────

export type WeightDto = {
  category: string;
  subcategory: string | null;
  maxScore: number;
  correctAnswer: string | null;
};

export type SurveyDefinitionDto = {
  id: string;
  jotformFormId: string;
  type: string;
  version: number;
  title: string;
  organizationId: string | null;
};

export type QuestionInsightDto = {
  summary: string;
  bestAnswers: { text: string; reason: string }[];
  model: string;
  generatedAt: string;
};

export type QuestionWithWeight = {
  id: string;
  externalId: string;
  text: string;
  type: string;
  options: string[];
  weight: WeightDto | null;
  insight: QuestionInsightDto | null;
};

export type SurveyListItem = {
  id: string;
  status: SubmissionStatus;
  isPre: boolean | null;
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
  id: string;
  title: string;
  status: string;
  registered: boolean;
};

export type JotformFormsSyncResult = { added: string[]; total: number };

// Preview de GET /form/:id/questions ya separado en preguntas ponderables
// vs. campos de catálogo (CATALOG_DATA) — antes de dar de alta la encuesta.
export type FormQuestionPreview = { externalId: string; text: string; type: string; options: string[] };
export type CatalogMatchPreview = { key: string; label: string; options: string[] };
export type FormQuestionsPreviewDto = {
  scoredQuestions: FormQuestionPreview[];
  catalogMatches: CatalogMatchPreview[];
  skipped: { externalId: string; type: string }[];
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
  students: number; // participantes distintos
  blanks: number; // respuestas en blanco (no cuentan para el cálculo)
  completed: boolean; // todas sus submissions ya están COMPLETADO
  canComplete: boolean; // tiene pre y post procesados
};

// Fila del dashboard de reportes: % pre, % post y cambio por subcategoría.
export type ReportRow = {
  category: string;
  subcategory: string | null;
  pre: number | null; // % promedio (0-100) de encuestas pre
  post: number | null; // % promedio (0-100) de encuestas post
  change: number | null; // post - pre
};
