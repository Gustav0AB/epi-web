import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
