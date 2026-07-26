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

function requireApiKey(): string {
  if (!env.JOTFORM_API_KEY) throw new Error("JOTFORM_API_KEY no configurada");
  return env.JOTFORM_API_KEY;
}

async function jotformGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const apiKey = requireApiKey();
  const url = new URL(path, env.JOTFORM_API_BASE);
  url.searchParams.set("apiKey", apiKey);
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
  async listForms(): Promise<JotformFormSummary[]> {
    const res = await jotformGet(`/user/forms`, ListFormsResponseSchema);
    return res.content.map((f) => ({ id: f.id, title: f.title, status: f.status }));
  },

  async getFormQuestions(formId: string): Promise<JotformQuestion[]> {
    const res = await jotformGet(`/form/${encodeURIComponent(formId)}/questions`, QuestionsResponseSchema);
    return Object.values(res.content);
  },
};
