import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  // Si se define, el webhook de Jotform exige ?secret= o header x-jotform-secret.
  JOTFORM_WEBHOOK_SECRET: z.string().min(8).optional(),
  // Requerida para analizar preguntas abiertas con IA. Hoy usamos Gemini;
  // si se cambia de proveedor, esto y ai.ts son lo único que hay que tocar.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  // API key de Jotform (cuenta) — para sincronizar el catálogo de
  // formularios y descargar sus preguntas (jotform-client.ts).
  JOTFORM_API_KEY: z.string().min(1).optional(),
  JOTFORM_API_BASE: z.string().url().default("https://api.jotform.com"),
  // Etiquetas de pregunta (tal como aparecen en Jotform, separadas por
  // coma) que se tratan como catálogo/filtro en vez de pregunta ponderable
  // — ej. "GRUPO,GRADO,TIPO DE PROGRAMA,EDAD". Comparación sin distinguir
  // mayúsculas/acentos, ver jotform-questions.ts#normalizeLabel.
  CATALOG_DATA: z.string().default(""),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:\n",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
