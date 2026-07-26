import { z } from "zod";
import { env } from "../../config/env.js";

export const AI_MODEL = env.GEMINI_MODEL;

const InsightSchema = z.object({
  summary: z.string(),
  bestAnswers: z.array(z.object({ text: z.string(), reason: z.string() })),
});

export type Insight = z.infer<typeof InsightSchema>;

// Gemini usa un subconjunto de JSON Schema (sin additionalProperties) para
// generationConfig.responseSchema — misma forma que validamos con InsightSchema.
const RESPONSE_SCHEMA = {
  type: "object",
  required: ["summary", "bestAnswers"],
  properties: {
    summary: { type: "string" },
    bestAnswers: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "reason"],
        properties: { text: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
} as const;

/**
 * Manda las respuestas de una pregunta abierta a Gemini y regresa un resumen
 * de los temas + las mejores respuestas con su razón. Salida estructurada.
 * `previousSummary` (si ya existía un análisis previo) se pasa como contexto
 * para que un re-análisis no contradiga el anterior — ponytail: memoria real
 * entre corridas (vector store, historial completo) queda para cuando haga falta.
 */
export async function summarizeOpenAnswers(
  question: string,
  answers: string[],
  previousSummary?: string | null
): Promise<Insight> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no configurada");

  const numbered = answers.map((a, i) => `${i + 1}. ${a}`).join("\n");
  const context = previousSummary
    ? `\nResumen de un análisis anterior de esta misma pregunta (para mantener continuidad, actualízalo si ya no aplica):\n"${previousSummary}"\n`
    : "";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `Eres analista de encuestas. Pregunta abierta:\n"${question}"\n\n` +
                  `Respuestas (${answers.length}):\n${numbered}\n${context}\n` +
                  `Devuelve un resumen conciso de los temas principales y selecciona las ` +
                  `mejores respuestas (las más claras, útiles o representativas), cada una ` +
                  `con una breve razón. Responde en español.`,
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini respondió ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("La IA no devolvió texto");
  return InsightSchema.parse(JSON.parse(text));
}
