import { CourseListQuerySchema } from "@epi/shared";
import { confirmCourseSelection, splitCourseApplication, courseComplementResults, listPublishedCourseReports, publishedCourseReport, courseReportHistory, publishCourseEdition, setCourseExpectedParticipants, getCourseReportDraft, saveCourseReportDraft, courseResults, courseOptions, listCourseEditions, createCourseEdition, courseEditionDetail, courseResponseCandidates, setCourseInstrument, setCourseMembership } from "./course-editions.service.js";
import { surveysService } from "./surveys.service.js";
import { setAssistantAutoSync, assistantMigrationStatus, assistantResponseCount, migrateAssistantResponses } from "./assistant-migration.service.js";
import { AssistantSyncSettingsSchema, JotformLabelsQuerySchema } from "@epi/shared";
import { listJotformLabels } from "./surveys.service.js";
import { coursePublicationHistory, publishCourse } from "./course-publications.service.js";
import { CoursePublicationKeySchema, PublishCourseSchema } from "@epi/shared";
import { Router } from "express";
import { apiSuccess, apiError, SaveSurveySetupSchema } from "@epi/shared";
import { validate } from "../../middlewares/validate.middleware.js";
import { getSurveySetup, saveSurveySetup } from "./survey-setup.service.js";
import multer from "multer";
import { surveysController } from "./surveys.controller.js";
import {
  requireAuth,
  requireFunctionality,
  requireRole,
} from "../../middlewares/auth.middleware.js";

// Público (protegido por secreto): lo que llama Jotform. El webhook real de
// Jotform manda multipart/form-data (rawRequest + formID/submissionID como
// campos de texto, sin archivos) — express.json()/urlencoded() no lo parsean,
// hace falta multer. .none() = no aceptamos archivos, solo campos de texto.
export const webhooksRouter = Router();
webhooksRouter.post("/jotform", multer().none(), surveysController.webhook);

// system_admin/org_admin sin restricción; functionality_user necesita el
// featureKey "surveys"/"scoring" asignado. Los resultados ya vienen acotados
// por organización/sitio desde el service (ver site-scope.ts).
export const surveysRouter = Router();
surveysRouter.get("/published-courses", requireAuth, async (req,res,next) => { try { res.json(apiSuccess(await listPublishedCourseReports(req.query,req.user!.sub))); } catch(error) { next(error); } });
surveysRouter.get("/published-courses/:id", requireAuth, async (req,res,next) => { try { res.json(apiSuccess(await publishedCourseReport(req.params.id!,req.user!.sub))); } catch(error) { next(error); } });
surveysRouter.get("/courses/:id/publications", requireAuth, async (req,res,next) => { try { res.json(apiSuccess(await courseReportHistory(req.params.id!,req.query,req.user!.sub))); } catch(error) { next(error); } });
surveysRouter.post("/courses/:id/publications", requireAuth, requireRole("system_admin","org_admin"), async (req,res,next) => { try { res.status(201).json(apiSuccess(await publishCourseEdition(req.params.id!,req.body,req.user!.sub))); } catch(error) { next(error); } });
surveysRouter.get("/courses", requireAuth, requireFunctionality("surveys"), async (req, res, next) => { try { res.json(apiSuccess(await listCourseEditions(req.query, req.user!.sub))); } catch (error) { next(error); } });
surveysRouter.post("/courses", requireAuth, requireFunctionality("surveys"), async (req, res, next) => { try { res.status(201).json(apiSuccess(await createCourseEdition(req.body, req.user!.sub))); } catch (error) { next(error); } });
surveysRouter.get("/courses/options", requireAuth, requireFunctionality("surveys"), async (req, res, next) => { try { res.json(apiSuccess(await courseOptions(req.user!.sub))); } catch (error) { next(error); } });
surveysRouter.get("/courses/:id", requireAuth, requireFunctionality("surveys"), async (req, res, next) => { try { const query = CourseListQuerySchema.parse(req.query); res.json(apiSuccess(await courseEditionDetail(req.params.id!, query.page, req.user!.sub))); } catch (error) { next(error); } });
surveysRouter.put("/courses/:id/expected-participants", requireAuth, requireFunctionality("surveys"), async (req,res,next) => { try { res.json(apiSuccess(await setCourseExpectedParticipants(req.params.id!,req.body,req.user!.sub))); } catch(error) { next(error); } });
surveysRouter.get("/courses/:id/report-draft", requireAuth, requireFunctionality("surveys"), async (req,res,next) => { try { res.json(apiSuccess(await getCourseReportDraft(req.params.id!,req.user!.sub))); } catch(error) { next(error); } });
surveysRouter.put("/courses/:id/report-draft", requireAuth, requireFunctionality("surveys"), async (req,res,next) => { try { res.json(apiSuccess(await saveCourseReportDraft(req.params.id!,req.body,req.user!.sub))); } catch(error) { next(error); } });
surveysRouter.get("/courses/:id/complements/:definitionId/results", requireAuth, requireFunctionality("surveys"), async (req,res,next) => { try { res.json(apiSuccess(await courseComplementResults(req.params.id!,req.params.definitionId!,req.user!.sub))); } catch(error) { next(error); } });
surveysRouter.get("/courses/:id/results", requireAuth, requireFunctionality("surveys"), async (req, res, next) => { try { res.json(apiSuccess(await courseResults(req.params.id!, req.query, req.user!.sub))); } catch (error) { next(error); } });
surveysRouter.get("/courses/:id/candidates", requireAuth, requireFunctionality("surveys"), async (req, res, next) => { try { res.json(apiSuccess(await courseResponseCandidates(req.params.id!, req.query, req.user!.sub))); } catch (error) { next(error); } });
surveysRouter.put("/courses/:id/instruments", requireAuth, requireFunctionality("surveys"), async (req, res, next) => { try { res.json(apiSuccess(await setCourseInstrument(req.params.id!, req.body, req.user!.sub))); } catch (error) { next(error); } });
surveysRouter.put("/courses/:id/responses", requireAuth, requireFunctionality("surveys"), async (req, res, next) => { try { res.json(apiSuccess(await setCourseMembership(req.params.id!, req.body, req.user!.sub))); } catch (error) { next(error); } });
surveysRouter.get("/schools", requireAuth, requireRole("system_admin", "org_admin"), async (req, res, next) => {
  try { res.json(apiSuccess(await surveysService.schoolCatalog(req.user!.sub))); } catch (error) { next(error); }
});
surveysRouter.get("/jotform/forms/:formId/response-count", requireAuth, requireRole("system_admin"), async (req, res, next) => {
  try { res.json(apiSuccess(await assistantResponseCount(req.params.formId!))); } catch (error) { next(error); }
});
surveysRouter.get("/jotform/forms/:formId/migration", requireAuth, requireRole("system_admin"), async (req, res, next) => {
  try { res.json(apiSuccess(await assistantMigrationStatus(req.params.formId!))); } catch (error) { next(error); }
});
surveysRouter.patch("/definitions/:id/migration-settings", requireAuth, requireRole("system_admin"), async (req, res, next) => {
  const input = AssistantSyncSettingsSchema.safeParse(req.body);
  if (!input.success) { res.status(400).json(apiError("VALIDATION_ERROR", "autoSync debe ser booleano")); return; }
  try { res.json(apiSuccess(await setAssistantAutoSync(req.params.id!, input.data.autoSync))); } catch (error) { next(error); }
});
surveysRouter.post("/definitions/:id/migrate", requireAuth, requireRole("system_admin"), async (req, res, next) => {
  try { res.json(apiSuccess(await migrateAssistantResponses(req.params.id!))); } catch (error) { next(error); }
});
surveysRouter.get("/jotform/labels", requireAuth, requireRole("system_admin"), async (req, res, next) => {
  const input = JotformLabelsQuerySchema.safeParse(req.query);
  if (!input.success) { res.status(400).json(apiError("VALIDATION_ERROR", "accountId debe ser un UUID válido")); return; }
  try { res.json(apiSuccess(await listJotformLabels(input.data.accountId))); }
  catch (error) { next(error); }
});

surveysRouter.get("/course-publications", requireAuth, async (req, res, next) => {
  try { res.json(apiSuccess(await coursePublicationHistory(CoursePublicationKeySchema.parse(req.query), req.user!.sub))); }
  catch (error) { next(error); }
});
surveysRouter.post("/course-publications", requireAuth, requireRole("system_admin", "org_admin"), async (req, res, next) => {
  try { res.status(201).json(apiSuccess(await publishCourse(PublishCourseSchema.parse(req.body), req.user!.sub))); }
  catch (error) { next(error); }
});

surveysRouter.get(
  "/",
  requireAuth,
  requireFunctionality("surveys"),
  surveysController.listSurveys,
);
surveysRouter.get(
  "/pending",
  requireAuth,
  requireFunctionality("surveys"),
  surveysController.listPending,
);
surveysRouter.get(
  "/count",
  requireAuth,
  requireFunctionality("surveys"),
  surveysController.countSince,
);
surveysRouter.get(
  "/summary",
  requireAuth,
  requireFunctionality("surveys"),
  surveysController.groupSummary,
);
surveysRouter.get(
  "/group-search",
  requireAuth,
  requireFunctionality("surveys"),
  surveysController.groupSearch,
);
surveysRouter.put("/:id/review-context", requireAuth, requireFunctionality("surveys"), surveysController.setSubmissionContext);
surveysRouter.put("/:id/review-moment", requireAuth, requireFunctionality("surveys"), surveysController.setSubmissionMoment);
surveysRouter.put("/:id/review-exclusion", requireAuth, requireFunctionality("surveys"), surveysController.setSubmissionExclusion);
surveysRouter.get("/course-detail", requireAuth, requireFunctionality("surveys"), surveysController.courseDetail);
surveysRouter.put("/group-expectation", requireAuth, requireFunctionality("surveys"), surveysController.saveCourseExpectation);
surveysRouter.post(
  "/groups/complete",
  requireAuth,
  requireFunctionality("surveys"),
  surveysController.completeGroup,
);
surveysRouter.get(
  "/groups",
  requireAuth,
  requireFunctionality("surveys"),
  surveysController.listGroups,
);
surveysRouter.get(
  "/definitions",
  requireAuth,
  requireFunctionality("surveys", "scoring", "open_questions"),
  surveysController.listDefinitions,
);
surveysRouter.get("/definitions/:id/source-contract", requireAuth, requireRole("system_admin"), async (req, res, next) => {
  try { res.json(apiSuccess(await surveysService.definitionSourceContract(req.params.id!, req.user!.sub))); } catch (error) { next(error); }
});
surveysRouter.get("/definitions/:id/filters", requireAuth, requireFunctionality("surveys"), surveysController.listFilters);
surveysRouter.get(
  "/definitions/:id/questions",
  requireAuth,
  requireFunctionality("scoring", "open_questions"),
  surveysController.listQuestions,
);
surveysRouter.patch(
  "/definitions/:id/open-questions-summary",
  requireAuth,
  requireFunctionality("open_questions"),
  surveysController.updateOpenQuestionsSummary,
);
surveysRouter.post(
  "/definitions/:id/weights/import",
  requireAuth,
  requireFunctionality("scoring"),
  surveysController.importWeights,
);
surveysRouter.post(
  "/definitions/:id/reprocess-pending",
  requireAuth,
  requireFunctionality("scoring"),
  surveysController.reprocessPending,
);
surveysRouter.put(
  "/questions/:id/weight",
  requireAuth,
  requireFunctionality("scoring"),
  surveysController.setWeight,
);
surveysRouter.delete(
  "/questions/:id/weight",
  requireAuth,
  requireFunctionality("scoring"),
  surveysController.deleteWeight,
);
surveysRouter.patch(
  "/questions/:id",
  requireAuth,
  requireFunctionality("scoring"),
  surveysController.updateQuestion,
);
surveysRouter.post(
  "/:id/reprocess",
  requireAuth,
  requireFunctionality("surveys"),
  surveysController.reprocess,
);

// El catálogo global y los formularios sin sitio quedan reservados a
// system_admin; la asociación de una definición valida el sitio permitido.
surveysRouter.get(
  "/unregistered",
  requireAuth,
  requireRole("system_admin"),
  surveysController.listUnregisteredForms,
);
surveysRouter.post(
  "/definitions",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  surveysController.registerDefinition,
);

surveysRouter.get("/jotform/forms/:formId/setup", requireAuth, requireRole("system_admin"), async (req, res, next) => {
  try { res.json(apiSuccess(await getSurveySetup(req.params.formId!))); }
  catch (error) {
    const err = error as Error & { statusCode?: number; code?: string };
    if (err.statusCode) res.status(err.statusCode).json(apiError(err.code ?? "ERROR", err.message));
    else next(error);
  }
});
surveysRouter.put("/jotform/forms/:formId/setup", requireAuth, requireRole("system_admin"), validate(SaveSurveySetupSchema), async (req, res, next) => {
  try { res.json(apiSuccess(await saveSurveySetup(req.params.formId!, req.body, req.user!))); }
  catch (error) {
    const err = error as Error & { statusCode?: number; code?: string };
    if (err.statusCode) res.status(err.statusCode).json(apiError(err.code ?? "ERROR", err.message));
    else next(error);
  }
});

// Catálogo de formularios de la cuenta de Jotform (GET /user/forms cacheado
// localmente) — para elegir un form y darlo de alta sin esperar a que ya
// haya enviado respuestas. El botón "sincronizar" hace el diff contra Jotform.
surveysRouter.get(
  "/jotform/forms",
  requireAuth,
  requireRole("system_admin"),
  surveysController.listJotformForms,
);
surveysRouter.post(
  "/jotform/forms/sync",
  requireAuth,
  requireRole("system_admin"),
  surveysController.syncJotformForms,
);
surveysRouter.get(
  "/jotform/forms/:formId/questions",
  requireAuth,
  requireRole("system_admin"),
  surveysController.previewFormQuestions,
);
surveysRouter.get(
  "/jotform/submissions",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  surveysController.listHistoricalSubmissions,
);
surveysRouter.post(
  "/jotform/submissions/import",
  requireAuth,
  requireRole("system_admin", "org_admin"),
  surveysController.importHistoricalSubmissions,
);
surveysRouter.get(
  "/jotform/accounts",
  requireAuth,
  requireRole("system_admin"),
  surveysController.listJotformAccounts,
);
surveysRouter.post(
  "/jotform/accounts",
  requireAuth,
  requireRole("system_admin"),
  surveysController.createJotformAccount,
);
surveysRouter.delete(
  "/jotform/accounts/:id",
  requireAuth,
  requireRole("system_admin"),
  surveysController.deleteJotformAccount,
);

// Reportes: cualquier usuario autenticado, restringido por su organización y
// sitios. Solo devuelve encuestas en estado COMPLETADO.
export const reportsRouter = Router();
reportsRouter.get("/results", requireAuth, surveysController.reportResults);
reportsRouter.get("/detail", requireAuth, surveysController.reportDetail);
reportsRouter.get(
  "/filters",
  requireAuth,
  surveysController.reportFilterOptions,
);

surveysRouter.post("/courses/:id/applications/:applicationId/split", requireAuth, requireFunctionality("surveys"), async (req,res,next) => {
  try { res.json(apiSuccess(await splitCourseApplication(req.params.id!,req.params.applicationId!,req.body,req.user!.sub))); }
  catch(error) { next(error); }
});

surveysRouter.post("/course-selection/confirm", requireAuth, requireFunctionality("surveys"), async (req,res,next) => {
  try { res.status(201).json(apiSuccess(await confirmCourseSelection(req.body,req.user!.sub))); }
  catch(error) { next(error); }
});

surveysRouter.post("/courses/:id/complete", requireAuth, requireRole("system_admin", "org_admin"), async (req,res,next) => {
  try { res.json(apiSuccess(await publishCourseEdition(req.params.id!,req.body,req.user!.sub,true))); }
  catch(error) { next(error); }
});
