import { z } from "zod";
import { env } from "../../config/env.js";

// Cliente delgado sobre la API de Jotform — solo lo que necesitamos:
// listar formularios de la cuenta y descargar las preguntas de uno.
// https://api.jotform.com/docs

const JotformFormSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
});
export type JotformFormSummary = z.infer<typeof JotformFormSchema>;

const ListFormsResponseSchema = z.object({
  responseCode: z.number(),
  content: z.array(JotformFormSchema.passthrough()),
});

// Un control de Jotform tal como viene en /form/{id}/questions — muy variable
// según el tipo (control_scale no trae "options", control_head no trae
// "qid" numérico útil, etc.), así que solo tipamos lo común y dejamos pasar
// el resto.
const JotformQuestionSchema = z
  .object({
    qid: z.string(),
    name: z.string(),
    text: z.string(),
    type: z.string(),
    options: z.string().optional(), // opciones separadas por "|"
  })
  .passthrough();
export type JotformQuestion = z.infer<typeof JotformQuestionSchema>;

const QuestionsResponseSchema = z.object({
  responseCode: z.number(),
  content: z.record(z.string(), JotformQuestionSchema),
});

const JotformSubmissionSchema = z
  .object({
    id: z.string(),
    form_id: z.string(),
    created_at: z.string(),
    answers: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();
export type JotformSubmission = z.infer<typeof JotformSubmissionSchema>;

const SubmissionsResponseSchema = z.object({
  responseCode: z.number(),
  content: z.array(JotformSubmissionSchema),
});

async function jotformGet<T>(
  path: string,
  apiKey: string,
  schema: z.ZodType<T>,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(path, env.JOTFORM_API_BASE);
  url.searchParams.set("apiKey", apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url);
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
  async listForms(apiKey: string): Promise<JotformFormSummary[]> {
    const res = await jotformGet(`/user/forms`, apiKey, ListFormsResponseSchema);
    return res.content.map((f) => ({ id: f.id, title: f.title, status: f.status }));
  },

  async getFormQuestions(formId: string, apiKey: string): Promise<JotformQuestion[]> {
    const res = await jotformGet(`/form/${encodeURIComponent(formId)}/questions`, apiKey, QuestionsResponseSchema);
    return Object.values(res.content);
  },

  async listSubmissions(
    formId: string,
    apiKey: string,
    filters: { from?: string; to?: string; limit?: number; offset?: number }
  ): Promise<JotformSubmission[]> {
    const filter: Record<string, string> = {};
    if (filters.from) filter["created_at:gt"] = `${filters.from} 00:00:00`;
    if (filters.to) filter["created_at:lt"] = `${filters.to} 23:59:59`;
    const res = await jotformGet(`/form/${encodeURIComponent(formId)}/submissions`, apiKey, SubmissionsResponseSchema, {
      limit: String(filters.limit ?? 1000),
      offset: String(filters.offset ?? 0),
      orderby: "created_at",
      ...(Object.keys(filter).length ? { filter: JSON.stringify(filter) } : {}),
    });
    return res.content.map((s) => ({ ...s, answers: s.answers ?? {} }));
  },
};
