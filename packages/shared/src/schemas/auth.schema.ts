import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthTokenSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number(),
});

export type LoginDto = z.infer<typeof LoginSchema>;
export type AuthToken = z.infer<typeof AuthTokenSchema>;
