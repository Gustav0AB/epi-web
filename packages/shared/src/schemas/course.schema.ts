import { z } from "zod";
import { SURVEY_MOMENTS, SUBMISSION_STATUSES } from "./survey.schema.js";
export const ExpectedParticipantsSchema = z.number().int().min(1).max(2147483647).nullable();
export const CourseExpectationUpdateSchema = z.object({ expectedRevision: z.number().int().min(0), expectedParticipantsPre: ExpectedParticipantsSchema, expectedParticipantsPost: ExpectedParticipantsSchema }).strict();
export const CreateCourseEditionSchema = z.object({ siteId: z.string().uuid(), primaryDefinitionId: z.string().uuid(), name: z.string().trim().min(1).max(200), school: z.string().trim().min(1).max(200), activity: z.string().trim().min(1).max(200), expectedParticipants: ExpectedParticipantsSchema.optional(), expectedParticipantsPre: ExpectedParticipantsSchema.optional(), expectedParticipantsPost: ExpectedParticipantsSchema.optional() }).strict();
export type CreateCourseEditionInput = z.infer<typeof CreateCourseEditionSchema>;
export const CourseInstrumentLinkSchema = z.object({ expectedRevision: z.number().int().min(0), definitionId: z.string().uuid(), linked: z.boolean() }).strict();
export const CourseMembershipSchema = z.object({ expectedRevision: z.number().int().min(0), linked: z.boolean(), responses: z.array(z.object({ id: z.string().uuid(), contextRevision: z.number().int().min(0) }).strict()).min(1).max(100).refine(items => new Set(items.map(item => item.id)).size === items.length, "Respuestas repetidas") }).strict();
export type CourseMembershipInput = z.infer<typeof CourseMembershipSchema>;
export const CourseResponseQuerySchema = z.object({ linked: z.literal("true").optional(), page: z.coerce.number().int().min(1).default(1), definitionId: z.string().uuid().optional(), from: z.string().date().optional(), to: z.string().date().optional() }).refine(input => !input.from || !input.to || input.from <= input.to, "Rango de fechas inválido");
export const CourseListQuerySchema = z.object({ school: z.string().trim().max(200).optional(), activity: z.string().trim().max(200).optional(), siteId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).default(1),
  status: z.enum(["DRAFT", "REVIEWED", "COMPLETED"]).optional(),
  year: z.coerce.number().int().min(1900).max(9999).optional(),
  from: z.string().date().optional(), to: z.string().date().optional(),
  moment: z.enum(["PRE", "POST", "BOTH"]).optional(), submittedOn: z.string().date().optional(),
}).refine(input => !input.from || !input.to || input.from <= input.to, "Rango de fechas inválido");
export type ResponseGroupingContext = { school: string | null; date: string | null; activity: string | null; dateSource: "manual" | "school_field" | "submitted_at" | null; originalSchool: string | null; submittedAt: string | null; gender: string | null; age: number | null; originalGender: unknown; originalAge: unknown; needsReview: boolean };
export type CourseResponseDto = { id: string; remoteId: string; definitionId: string; instrument: string; instrumentKind: string | null; version: number; contextRevision: number; context: ResponseGroupingContext; moment: typeof SURVEY_MOMENTS[number]; status: typeof SUBMISSION_STATUSES[number]; reviewExcluded: boolean; possibleDuplicate: boolean; receivedAt: string; linkedCourseId: string | null; issues: string[]; canLink: boolean };
export type CourseApplicationDto = { id: string; definitionId: string; instrument: string; version: number; date: string; moment: typeof SURVEY_MOMENTS[number]; responseCount: number; validContextCount: number; excludedCount: number; reviewCount: number };
export type CourseEditionDto = { id: string; siteId: string; name: string; school: string; activity: string; primaryDefinitionId: string; expectedParticipants: number | null; expectedParticipantsPre: number | null; expectedParticipantsPost: number | null; revision: number; createdAt: string };
export type CourseEditionDetailDto = CourseEditionDto & { applications: CourseApplicationDto[]; responses: CourseResponseDto[]; instruments: { id: string; title: string; version: number; kind: string | null; linked: boolean }[]; totalResponses: number; responsePage: number; responsePages: number };
export type CourseResponsePage = { rows: CourseResponseDto[]; page: number; total: number; totalPages: number };
export type CourseEditionsPage = { rows: (CourseEditionDto & { siteName?: string; applicationDate?: string | null; preResponses?: number; postResponses?: number })[]; page: number; total: number; totalPages: number };

export type CourseOptionsDto = { sites: { id: string; name: string; isActive: boolean }[]; definitions: { id: string; siteId: string; title: string; kind: string | null; version: number; programName: string | null }[]; schools: { siteId: string; name: string }[] };

export function courseResponseCoverage(receipts: number, expectedParticipants: number | null): { percent: number | null; meetsThreshold: boolean | null } {
  if (expectedParticipants === null || !Number.isInteger(expectedParticipants) || expectedParticipants <= 0 || !Number.isInteger(receipts) || receipts < 0) return { percent: null, meetsThreshold: null };
  const ratio = receipts / expectedParticipants;
  return { percent: ratio * 100, meetsThreshold: ratio >= 0.8 };
}
