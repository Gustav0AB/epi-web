import { z } from "zod";

const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores");

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(100),
  username: usernameSchema,
  email: z.string().email(),
  role: z.enum(["admin", "user"]).default("user"),
  featureKeys: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  username: usernameSchema,
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["admin", "user"]).default("user"),
  featureKeys: z.array(z.string()).default([]),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  username: usernameSchema.optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "user"]).optional(),
  featureKeys: z.array(z.string()).optional(),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
