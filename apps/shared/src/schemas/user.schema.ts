import { z } from "zod";

const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores");

export const ROLES = ["system_admin", "org_admin", "report_viewer", "functionality_user"] as const;
export type Role = (typeof ROLES)[number];

const roleSchema = z.enum(ROLES);

// Todo rol salvo system_admin pertenece a una organización.
// "reports" e "interactive_reports" son vistas mutuamente excluyentes:
// ningún usuario puede tener acceso a ambas a la vez.
function validateUserFields<
  T extends {
    role?: Role | undefined;
    organizationId?: string | null | undefined;
    reportTemplateKeys?: string[] | undefined;
  },
>(data: T, ctx: z.RefinementCtx) {
  if (data.role && data.role !== "system_admin" && !data.organizationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["organizationId"],
      message: "organizationId is required for this role",
    });
  }
  if (data.reportTemplateKeys?.includes("reports") && data.reportTemplateKeys.includes("interactive_reports")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reportTemplateKeys"],
      message: "reportTemplateKeys cannot include both 'reports' and 'interactive_reports'",
    });
  }
}

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(100),
  username: usernameSchema,
  email: z.string().email(),
  role: roleSchema.default("functionality_user"),
  institutionalPosition: z.string().max(100).nullable().default(null),
  isActive: z.boolean().default(true),
  featureKeys: z.array(z.string()).default([]),
  reportTemplateKeys: z.array(z.string()).default([]),
  organizationId: z.string().uuid().nullable().default(null),
  siteIds: z.array(z.string()).default([]), // sitio(s) de referencia (vista por defecto, no restringe)
  excludedSiteIds: z.array(z.string()).default([]), // sitios de su organización que NO puede ver
  excludedSurveyDefinitionIds: z.array(z.string()).default([]), // encuestas que NO puede ver
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateUserSchema = z
  .object({
    name: z.string().min(2).max(100),
    username: usernameSchema,
    email: z.string().email(),
    password: z.string().min(8).max(72),
    role: roleSchema.default("functionality_user"),
    institutionalPosition: z.string().max(100).nullable().optional(),
    featureKeys: z.array(z.string()).default([]),
    reportTemplateKeys: z.array(z.string()).default([]),
    organizationId: z.string().uuid().nullable().optional(),
    siteIds: z.array(z.string()).optional(),
    excludedSiteIds: z.array(z.string()).optional(),
    excludedSurveyDefinitionIds: z.array(z.string()).optional(),
  })
  .superRefine(validateUserFields);

export const UpdateUserSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    username: usernameSchema.optional(),
    email: z.string().email().optional(),
    role: roleSchema.optional(),
    institutionalPosition: z.string().max(100).nullable().optional(),
    isActive: z.boolean().optional(),
    featureKeys: z.array(z.string()).optional(),
    reportTemplateKeys: z.array(z.string()).optional(),
    organizationId: z.string().uuid().nullable().optional(),
    siteIds: z.array(z.string()).optional(),
    excludedSiteIds: z.array(z.string()).optional(),
    excludedSurveyDefinitionIds: z.array(z.string()).optional(),
  })
  .superRefine(validateUserFields);

export const ResetPasswordSchema = z.object({
  password: z.string().min(8).max(72),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
