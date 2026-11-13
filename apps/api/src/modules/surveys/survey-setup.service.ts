import { instrumentQuestion, preserveOpenQuestion } from "@epi/shared";
import { questionCatalogIssue, type SurveySetupQuestion, SurveySetupDraftSchema, INSTRUMENT_KINDS, type SaveSurveySetupInput, type SurveySetupDto } from "@epi/shared";
import { previewFormQuestions } from "./surveys.service.js";
import { prisma } from "../../db/prisma.js";
import { auditService } from "../audit/audit.service.js";
import type { JwtPayload } from "../../middlewares/auth.middleware.js";

const conflict = () => Object.assign(new Error("Configuration changed; reopen the form before saving"), { statusCode: 409, code: "CONFLICT" });

export async function getSurveySetup(formId: string): Promise<SurveySetupDto> {
  const form = await prisma.jotformForm.findUnique({ where: { id: formId }, select: { title: true, setupDraft: true, setupRevision: true } });
  if (!form) throw Object.assign(new Error("Form not found"), { statusCode: 404, code: "NOT_FOUND" });
  const active = await prisma.surveyDefinition.findFirst({ where: { jotformFormId: formId }, orderBy: { version: "desc" }, include: { questions: { include: { weight: true } } } });
  const activeDraft = active ? SurveySetupDraftSchema.parse({
    baseDefinitionId: active.id, scoringWeightsVersion: 4, siteId: active.siteId, type: active.type,
    programName: active.programName ?? "", instrumentKind: INSTRUMENT_KINDS.includes(active.instrumentKind as typeof INSTRUMENT_KINDS[number]) ? active.instrumentKind : undefined,
    instrumentName: active.instrumentName || form.title, activityName: active.activityName ?? "", activityType: active.activityType ?? "", description: active.description ?? "", ...(active.timeZone ? { timeZone: active.timeZone } : {}),
    analysisWeights: active.analysisWeights ?? [], matrixDefaults: active.matrixDefaults ?? [],
    ...(active.categoryWeights ? { categoryWeights: active.categoryWeights } : {}), ...(active.subcategoryWeights ? { subcategoryWeights: active.subcategoryWeights } : {}),
    questions: active.questions.map(question => ({ ...question, weight: question.weight ? { ...question.weight } : null })),
  }) : undefined;
  const saved = form.setupDraft ? SurveySetupDraftSchema.parse(form.setupDraft) : undefined;
  return {
    draft: { ...(active && saved?.baseDefinitionId !== active.id ? activeDraft! : saved ?? activeDraft ?? { siteId: null, type: "LOCAL", instrumentName: "", activityName: "" }), instrumentName: form.title },
    ...(active && activeDraft ? { activeVersion: { id: active.id, version: active.version, draft: activeDraft } } : {}),
    revision: form.setupRevision,
    options: (await prisma.surveySetupOption.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] })).map(option => ({ kind: option.kind as "INSTRUMENT" | "ACTIVITY" | "ACTIVITY_TYPE", name: option.name })),
  };
}

export async function validateSiteSetup(draft: SurveySetupDto["draft"]) {
  if (!draft.siteId) return;
  const site = await prisma.site.findUnique({ where: { id: draft.siteId } });
  if (!site) throw Object.assign(new Error("Site not found"), { statusCode: 400 });
  if (draft.programName && draft.type !== (draft.programName === "Local" ? "LOCAL" : draft.programName === "Visiting" ? "VISITING" : "OTHER")) throw Object.assign(new Error("La clasificación del programa no coincide"), { statusCode: 400 });
  if (draft.programName && !site.isActive) throw Object.assign(new Error("El sitio está inactivo"), { statusCode: 400 });
  if (draft.programName && !site.programs.includes(draft.programName)) throw Object.assign(new Error("El programa no pertenece al sitio seleccionado"), { statusCode: 400 });
  if (draft.programName && draft.activityType && !site.activityTypes.includes(draft.activityType)) throw Object.assign(new Error("El tipo de actividad no pertenece al sitio seleccionado"), { statusCode: 400 });
}

export async function saveSurveySetup(formId: string, input: SaveSurveySetupInput, actor: JwtPayload) {
  input = { ...input, draft: SurveySetupDraftSchema.parse(input.draft) };
  await validateSiteSetup(input.draft);
  const source = await prisma.jotformForm.findUnique({ where: { id: formId }, select: { title: true } });
  if (!source) throw Object.assign(new Error("Form not found"), { statusCode: 404 });
  input.draft.instrumentName = source.title;
  if (input.draft.questions?.length || input.draft.matrixDefaults?.length) {
    const preview = await previewFormQuestions(formId);
    if (input.draft.matrixDefaults?.some(group => !preview.scoredQuestions.some(question => question.sourceContext?.matrix?.externalId === group.externalId))) throw Object.assign(new Error("Las matrices cambiaron; revisa sus reglas generales"), { statusCode: 409 });
    for (const question of input.draft.questions ?? []) {
      const original = preview.scoredQuestions.find(item => item.externalId === question.externalId);
      if (!original) throw Object.assign(new Error("Las preguntas cambiaron; vuelve a abrir el formulario"), { statusCode: 409 });
      if (original.sourceContext?.matrix && question.sourceContext?.matrix && JSON.stringify(original.sourceContext.matrix) !== JSON.stringify(question.sourceContext.matrix)) throw Object.assign(new Error(`Las filas cambiaron; confirma la fila actual: ${original.text}`), { statusCode: 409 });
      if (original.type === "OPEN_TEXT") Object.assign(question, preserveOpenQuestion(question));
      question.text = original.text;
      if (original.sourceContext) question.sourceContext = original.sourceContext; else delete question.sourceContext;
      if (question.role === "FILTER") { question.role = "INFORMATIONAL"; question.isFilter = true; }
      if (input.draft.configurationMode === "instrument") Object.assign(question, instrumentQuestion(question));
    }
  }
  const saved = await prisma.$transaction(async (tx) => {
    // Lock the form before checking registration so confirmation and saving cannot race.
    const updated = await tx.jotformForm.updateMany({
      where: { id: formId, setupRevision: input.revision },
      data: { setupRevision: { increment: 1 } },
    });
    if (updated.count !== 1) throw conflict();
    const active = await tx.surveyDefinition.findFirst({ where: { jotformFormId: formId }, orderBy: { version: "desc" }, select: { id: true, siteId: true, type: true } });
    if (active ? input.draft.baseDefinitionId !== active.id || input.draft.siteId !== active.siteId || input.draft.scoringWeightsVersion !== 4 : !!input.draft.baseDefinitionId) throw conflict();
    const draft = { ...input.draft };
    for (const [kind, field] of [["ACTIVITY", "activityName"]] as const) {
      const name = draft[field];
      if (!name) continue;
      const option = await tx.surveySetupOption.upsert({
        where: { kind_key: { kind, key: name.toLowerCase() } },
        create: { kind, key: name.toLowerCase(), name }, update: {},
      });
      draft[field] = option.name;
    }
    await tx.jotformForm.update({ where: { id: formId }, data: { setupDraft: draft } });
    return { draft, revision: input.revision + 1 };
  });
  await auditService.record(actor, "SURVEY_SETUP_SAVE", { type: "JotformForm", id: formId }, { revision: saved.revision });
  return saved;
}

export async function validateSetupQuestionCatalog(questions: SurveySetupQuestion[], siteId: string, requireSubcategory = false) {
  const scored = questions.filter(question => (question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT");
  if (!scored.length) return;
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { organizationId: true } });
  const categories = site?.organizationId ? await prisma.category.findMany({ where: { organizationId: site.organizationId, isActive: true, siteLinks: { some: { siteId } } } }) : [];
  for (const question of scored) {
    const issue = questionCatalogIssue(question, categories, site?.organizationId, requireSubcategory);
    if (issue) throw Object.assign(new Error(`${issue} Pregunta: ${question.text.slice(0, 120)}`), { statusCode: 400, code: "BAD_REQUEST" });
  }
}
