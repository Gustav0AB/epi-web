import { Router } from "express";
import multer from "multer";
import { surveysController } from "./surveys.controller.js";
import { requireAuth, requireFunctionality, requireRole } from "../../middlewares/auth.middleware.js";

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
surveysRouter.get("/", requireAuth, requireFunctionality("surveys"), surveysController.listSurveys);
surveysRouter.get("/pending", requireAuth, requireFunctionality("surveys"), surveysController.listPending);
surveysRouter.get("/count", requireAuth, requireFunctionality("surveys"), surveysController.countSince);
surveysRouter.get("/summary", requireAuth, requireFunctionality("surveys"), surveysController.groupSummary);
surveysRouter.post("/groups/complete", requireAuth, requireFunctionality("surveys"), surveysController.completeGroup);
surveysRouter.get("/groups", requireAuth, requireFunctionality("surveys"), surveysController.listGroups);
surveysRouter.get("/definitions", requireAuth, requireFunctionality("surveys", "scoring", "open_questions"), surveysController.listDefinitions);
surveysRouter.get("/definitions/:id/questions", requireAuth, requireFunctionality("scoring", "open_questions"), surveysController.listQuestions);
surveysRouter.post("/definitions/:id/weights/import", requireAuth, requireFunctionality("scoring"), surveysController.importWeights);
surveysRouter.post("/definitions/:id/reprocess-pending", requireAuth, requireFunctionality("scoring"), surveysController.reprocessPending);
surveysRouter.put("/questions/:id/weight", requireAuth, requireFunctionality("scoring"), surveysController.setWeight);
surveysRouter.patch("/questions/:id", requireAuth, requireFunctionality("scoring"), surveysController.updateQuestion);
surveysRouter.post("/:id/reprocess", requireAuth, requireFunctionality("surveys"), surveysController.reprocess);
surveysRouter.post("/questions/:id/analyze", requireAuth, requireFunctionality("scoring", "open_questions"), surveysController.analyzeQuestion);

// Alta de instrumentos: solo admins deciden a qué sitio/tipo se asocia un
// formID nuevo — no es una tarea de un functionality_user con "scoring".
surveysRouter.get("/unregistered", requireAuth, requireRole("system_admin", "org_admin"), surveysController.listUnregisteredForms);
surveysRouter.post("/definitions", requireAuth, requireRole("system_admin", "org_admin"), surveysController.registerDefinition);

// Catálogo de formularios de la cuenta de Jotform (GET /user/forms cacheado
// localmente) — para elegir un form y darlo de alta sin esperar a que ya
// haya enviado respuestas. El botón "sincronizar" hace el diff contra Jotform.
surveysRouter.get("/jotform/forms", requireAuth, requireRole("system_admin", "org_admin"), surveysController.listJotformForms);
surveysRouter.post("/jotform/forms/sync", requireAuth, requireRole("system_admin", "org_admin"), surveysController.syncJotformForms);
surveysRouter.get("/jotform/forms/:formId/questions", requireAuth, requireRole("system_admin", "org_admin"), surveysController.previewFormQuestions);

// Reportes: cualquier usuario autenticado, restringido por su organización y
// sitios. Solo devuelve encuestas en estado COMPLETADO.
export const reportsRouter = Router();
reportsRouter.get("/results", requireAuth, surveysController.reportResults);
reportsRouter.get("/filters", requireAuth, surveysController.reportFilterOptions);
