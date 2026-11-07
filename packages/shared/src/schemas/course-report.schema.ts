import { z } from "zod";
import { CourseResultsQuerySchema } from "./course-results.schema.js";
export const CourseReportContentSchema = z.object({ studentQuote: z.string().max(5000).optional(), recommendationText: z.string().max(5000).optional(), conservationImpacts: z.string().max(5000).optional(), spotlightText: z.string().max(5000).optional() }).strict();
export const CourseCategoriesSchema = z.array(z.string().trim().min(1).max(200)).min(1).max(200).refine(items => new Set(items).size === items.length, "Categorías repetidas");
export const CourseReportDraftSchema = z.object({ categories: CourseCategoriesSchema.optional(), templateKey: z.enum(["course-impacts-general","course-impacts-2026mx-ncssm","course-impacts-2026cr-burton","course-impacts-2026mx-templeton"]), textContent: CourseReportContentSchema, from: z.string().date().optional(), to: z.string().date().optional() }).strict().refine(input => CourseResultsQuerySchema.safeParse({ from: input.from, to: input.to }).success, "Rango de fechas inválido");
export type CourseReportDraft = z.infer<typeof CourseReportDraftSchema>;
export const SaveCourseReportDraftSchema = z.object({ expectedRevision: z.number().int().min(0), draft: CourseReportDraftSchema }).strict();
export type CourseReportDraftDto = { courseId: string; revision: number; draft: CourseReportDraft; savedAt: string | null };
export const COURSE_REPORT_DRAFT_NOTICE = "BORRADOR DE REVISIÓN — NO PUBLICADO. Vista previa editable; no es una publicación.";

export const PublishCourseEditionSchema = z.object({ categories: CourseCategoriesSchema.optional(), expectedRevision: z.number().int().min(0), expectedVersion: z.number().int().min(0) }).strict();
export type CourseReportPublicationSummary = { id: string; courseId: string; version: number; createdAt: string; name: string; school: string; siteId: string };
export type CourseReportPublication = CourseReportPublicationSummary & { snapshot: { schemaVersion: 1; component: "learning"; result: import("./course-results.schema.js").CourseResultsDto; draft: CourseReportDraft; document: { template: import("../report-templates/types.js").ReportDocumentTemplate; data: import("../report-templates/types.js").ReportData } } };
export type CourseReportPublicationsPage = { rows: CourseReportPublicationSummary[]; page: number; total: number; totalPages: number };
