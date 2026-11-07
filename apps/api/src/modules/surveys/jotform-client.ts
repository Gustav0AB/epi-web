import { type AnswerJson, AnswerJsonSchema } from "./surveys.schema.js";
import type { JotformFormDto, JotformLabelDto } from "@epi/shared";
import { z } from "zod";
import { env } from "../../config/env.js";

// Cliente delgado sobre la API de Jotform — solo lo que necesitamos:
// listar formularios de la cuenta y descargar las preguntas de uno.
// https://api.jotform.com/docs

const JotformFormSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  folders: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  count: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().min(0).max(2147483647)).nullish(),
  last_submission: z.string().nullish(),
  url: z.string().url().refine(value => ["https:", "http:"].includes(new URL(value).protocol)).nullish(),
});
export type JotformFormSummary = Omit<JotformFormDto, "registered" | "accountName" | "syncedAt">;

const ListFormsResponseSchema = z.object({
  responseCode: z.literal(200),
  content: z.array(JotformFormSchema.passthrough()),
});

type LabelNode = JotformLabelDto & { sublabels?: LabelNode[] | Record<string, LabelNode> | null | undefined };
const LabelNodeSchema: z.ZodType<LabelNode> = z.lazy(() => z.object({
  id: z.string().trim().min(1), name: z.string().trim().min(1),
  sublabels: z.union([z.array(LabelNodeSchema), z.record(LabelNodeSchema)]).nullish(),
}));
const LabelsResponseSchema = z.object({
  responseCode: z.literal(200),
  content: z.union([
    z.array(LabelNodeSchema),
    // Jotform wraps account labels in an unnamed root container.
    z.object({ id: z.string().min(1), sublabels: z.union([z.array(LabelNodeSchema), z.record(LabelNodeSchema)]) })
      .transform(root => root.sublabels),
    z.record(LabelNodeSchema),
  ]),
});

// Un control de Jotform tal como viene en /form/{id}/questions — muy variable
// según el tipo (control_scale no trae "options", control_head no trae
// "qid" numérico útil, etc.), así que solo tipamos lo común y dejamos pasar
// el resto.
const JotformQuestionSchema = z
  .object({
    qid: z.string().optional(),
    name: z.string().optional(),
    text: z.string().default(""),
    type: z.string(),
    options: z.unknown().optional(), // Algunos controles devuelven opciones estructuradas.
  })
  .passthrough();
export type JotformQuestion = z.infer<typeof JotformQuestionSchema>;

const QuestionSourceSchema = z.union([z.record(z.string(), z.record(AnswerJsonSchema)), z.array(z.never()).length(0)]);
export type JotformQuestionSource = z.infer<typeof QuestionSourceSchema>;

export function normalizeFormQuestions(source: JotformQuestionSource): JotformQuestion[] {
  const parsed = QuestionsResponseSchema.safeParse({ responseCode: 200, content: Array.isArray(source) ? {} : source });
  if (!parsed.success) throw Object.assign(new Error("Jotform API questions: respuesta inesperada"), { statusCode: 502 });
  const questions: JotformQuestion[] = Object.entries(parsed.data.content).map(([sourceId, question]) => ({ ...question, qid: question.qid ?? sourceId }));
  const ordered = questions.every(question => typeof question.order === "string" && /^\d+$/.test(question.order) || typeof question.order === "number" && Number.isSafeInteger(question.order) && question.order >= 0);
  return ordered ? questions.sort((a, b) => Number(a.order) - Number(b.order)) : questions;
}

const QuestionsResponseSchema = z.object({
  responseCode: z.literal(200),
  content: z.record(z.string(), JotformQuestionSchema),
});

export const JotformSubmissionSchema = z
  .object({
    id: z.string(),
    form_id: z.string(),
    created_at: z.string(),
    answers: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();
export type JotformSubmission = z.infer<typeof JotformSubmissionSchema>;

const SubmissionsResponseSchema = z.object({
  responseCode: z.literal(200),
  content: z.array(JotformSubmissionSchema),
});

async function jotformGet<T>(
  path: string,
  apiKey: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(path, env.JOTFORM_API_BASE);
  url.searchParams.set("apiKey", apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw Object.assign(new Error(`Jotform API ${path} respondió ${res.status}`), { statusCode: 502 });
  }
  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw Object.assign(new Error(`Jotform API ${path}: respuesta inesperada`), { statusCode: 502 });
  }
  return parsed.data;
}

export const jotformClient = {
  async listLabels(apiKey: string): Promise<JotformLabelDto[]> {
    const response = await jotformGet("/user/labels", apiKey, LabelsResponseSchema);
    const labels = new Map<string, JotformLabelDto>();
    const pending = Object.values(response.content);
    while (pending.length) {
      const label = pending.pop()!;
      const existing = labels.get(label.id);
      if (existing && existing.name !== label.name) throw Object.assign(new Error("Jotform labels: nombres incompatibles para el mismo ID"), { statusCode: 502 });
      labels.set(label.id, { id: label.id, name: label.name });
      pending.push(...Object.values(label.sublabels ?? {}));
    }
    return [...labels.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  },
  async listForms(apiKey: string): Promise<JotformFormSummary[]> {
    const forms = new Map<string, JotformFormSummary>();
    let offset = 0;
    while (true) {
      const res = await jotformGet(`/user/forms`, apiKey, ListFormsResponseSchema, {
        limit: "100", offset: String(offset), orderby: "id",
      });
      if (res.content.length === 0) return [...forms.values()];
      const previousSize = forms.size;
      for (const form of res.content) forms.set(form.id, {
        id: form.id, title: form.title, status: form.status,
        labelIds: [...new Set((form.folders ?? "").split(",").map(value => value.trim()).filter(Boolean))],
        // Keep provider timestamps verbatim: their timezone is not established here.
        createdAt: form.created_at || null, updatedAt: form.updated_at || null,
        submissionCount: form.count == null ? null : Number(form.count),
        lastSubmission: form.last_submission || null, url: form.url ?? null,
      });
      if (forms.size === previousSize) {
        throw Object.assign(new Error("Jotform API /user/forms: la paginación no avanza"), { statusCode: 502 });
      }
      // Advance by the actual page size: the provider may cap the requested limit.
      offset += res.content.length;
    }
  },

  async getFormProperties(formId: string, apiKey: string): Promise<Record<string, AnswerJson>> {
    const result = await jotformGet(`/form/${encodeURIComponent(formId)}/properties`, apiKey, z.object({ responseCode: z.literal(200), content: z.record(AnswerJsonSchema) }));
    return result.content;
  },

  async getFormQuestionSource(formId: string, apiKey: string): Promise<JotformQuestionSource> {
    const result = await jotformGet(`/form/${encodeURIComponent(formId)}/questions`, apiKey, z.object({ responseCode: z.literal(200), content: QuestionSourceSchema }));
    return result.content;
  },

  async getFormQuestions(formId: string, apiKey: string): Promise<JotformQuestion[]> {
    return normalizeFormQuestions(await jotformClient.getFormQuestionSource(formId, apiKey));
  },

  async listSubmissionPage(
    formId: string,
    apiKey: string,
    filters: { from?: string; to?: string; limit?: number; offset?: number }
  ): Promise<JotformSubmission[]> {
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 1000;
    if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(offset) || offset < 0) {
      throw Object.assign(new Error("Invalid Jotform pagination parameters"), { statusCode: 400 });
    }
    const filter: Record<string, string> = {};
    if (filters.from) filter["created_at:gt"] = `${filters.from} 00:00:00`;
    if (filters.to) filter["created_at:lt"] = `${filters.to} 23:59:59`;
    const res = await jotformGet(`/form/${encodeURIComponent(formId)}/submissions`, apiKey, SubmissionsResponseSchema, {
      limit: String(limit), offset: String(offset), orderby: "created_at",
      ...(Object.keys(filter).length ? { filter: JSON.stringify(filter) } : {}),
    });
    if (res.content.some(row => !row.id || row.form_id !== formId)) {
      throw Object.assign(new Error("Jotform submissions: identificador de respuesta o formulario inesperado"), { statusCode: 502 });
    }
    return res.content;
  },

  async listSubmissions(
    formId: string,
    apiKey: string,
    filters: { from?: string; to?: string; limit?: number; offset?: number }
  ): Promise<JotformSubmission[]> {
    const submissions = new Map<string, JotformSubmission>();
    let offset = filters.offset ?? 0;
    // shortcut: legacy previews collect all responses; the assistant persists one page at a time.
    while (true) {
      const rows = await jotformClient.listSubmissionPage(formId, apiKey, { ...filters, offset });
      if (rows.length === 0) return [...submissions.values()];
      const previousSize = submissions.size;
      for (const row of rows) submissions.set(row.id, row);
      if (submissions.size === previousSize) {
        throw Object.assign(new Error("Jotform submissions: la paginación no avanza"), { statusCode: 502 });
      }
      offset += rows.length;
    }
  },
};
