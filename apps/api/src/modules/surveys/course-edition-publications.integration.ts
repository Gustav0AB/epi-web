import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { prisma } from "../../db/prisma.js";
import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import { internalCourseReport, publishedReportFilterOptions, groupMigratedCourseResponse, courseResults, createCourseEdition, setCourseMembership, saveCourseReportDraft, getCourseReportDraft, setCourseExpectedParticipants, publishCourseEdition, publishedCourseReport, courseReportHistory, listPublishedCourseReports } from "./course-editions.service.js";
import { surveysService, setSubmissionContext, setSubmissionMoment, setSubmissionExclusion } from "./surveys.service.js";
assert.equal(process.env.NODE_ENV,"test"); assert.equal(new URL(process.env.DATABASE_URL!).pathname,"/epi_setup_test");
try {
 const admin = await prisma.user.create({ data: { username: "publication_admin", name: "Admin", email: "publication-admin@example.test", password: "unused", role: "SYSTEM_ADMIN" } });
 const organization = await prisma.organization.create({ data: { name: "Publication integration" } });
 const site = await prisma.site.create({ data: { organizationId: organization.id, name: "Publication site" } });
 const other = await prisma.site.create({ data: { organizationId: organization.id, name: "Other publication site" } });
 const viewer = await prisma.user.create({ data: { username: "publication_viewer", name: "Viewer", email: "publication-viewer@example.test", password: "unused", role: "REPORT_VIEWER", siteIds: [site.id], organizationId: organization.id } });
 const operator = await prisma.user.create({ data: { username: "publication_operator", name: "Operator", email: "publication-operator@example.test", password: "unused", role: "FUNCTIONALITY_USER", siteIds: [site.id], organizationId: organization.id } });
 const denied = await prisma.user.create({ data: { username: "publication_denied", name: "Denied", email: "publication-denied@example.test", password: "unused", role: "REPORT_VIEWER", siteIds: [other.id], organizationId: organization.id } });
 const definition = await prisma.surveyDefinition.create({ data: { jotformFormId: "publication-e6", siteId: site.id, instrumentKind: "LEARNING", instrumentName: "Aprendizaje publicado", activityName: "Visita", configurationVersion: 4, analysisWeights: [{ analysisType: "pre_post", standardDeviation: "sample", categoryWeights: [{ category: "Learning", weight: 100 }], subcategoryWeights: [{ category: "Learning", subcategory: "Knowledge", weight: 100 }] }], questions: { create: [
  { externalId: "school", text: "Escuela", type: "OPEN_TEXT", role: "SCHOOL_GROUP" },
  { externalId: "scale", text: "Escala", type: "LIKERT", role: "SCORED", options: ["Alto","Bajo"], classification: { category: "Learning", subcategory: "Knowledge" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true },{ analysisType: "pre_post_post", enabled: false }], analysisScoring: [{ analysisType: "pre_post", maxScore: 10, correctAnswer: null, scoringMode: "ordered_scale", inverse: false, scaleOptions: ["Alto","Bajo"], responsePolicy: { blank: "exclude", invalid: "review" } }] },
 ] } } });
 const pre = await surveysService.ingest({ formID: definition.jotformFormId, submissionID: "publish-pre", surveyMoment: "PRE", answers: [{ questionId: "school", value: "01/11/2026 - Escuela Publicación" },{ questionId: "scale", value: "Alto" }] });
 const post = await surveysService.ingest({ formID: definition.jotformFormId, submissionID: "publish-post", surveyMoment: "POST", answers: [{ questionId: "school", value: "05/11/2026 - Escuela Publicación" },{ questionId: "scale", value: "Bajo" }] });
 const course = await createCourseEdition({ siteId: site.id, primaryDefinitionId: definition.id, school: "Escuela Publicación", activity: "Visita", name: "Curso publicado", expectedParticipants: 1 },admin.id);
 await setCourseMembership(course.id,{ expectedRevision: 0, linked: true, responses: [pre,post].map(row => ({ id: row.submissionId, contextRevision: 0 })) },admin.id);
 let result = await courseResults(course.id,{},admin.id);
 assert.equal(result.aggregates.find(row => row.level === "index")!.change,-50);
 await assert.rejects(() => publishCourseEdition(course.id,{ expectedRevision: result.revision, expectedVersion: 0 },admin.id), error => error instanceof Error && error.message.includes("Guarda"));
 await saveCourseReportDraft(course.id,{ expectedRevision: result.revision, draft: { templateKey: "course-impacts-general", textContent: { studentQuote: "Texto original publicado" } } },admin.id);
 result = await courseResults(course.id,{},admin.id);
 await assert.rejects(() => publishCourseEdition(course.id,{ expectedRevision: result.revision, expectedVersion: 0 },viewer.id),{ statusCode: 403 });
 await setCourseExpectedParticipants(course.id,{ expectedRevision: result.revision, expectedParticipantsPre: 2, expectedParticipantsPost: 2 },admin.id);
 result = await courseResults(course.id,{},admin.id);
 await assert.rejects(() => publishCourseEdition(course.id,{ expectedRevision: result.revision, expectedVersion: 0 },admin.id), error => error instanceof Error && error.message.includes("80%"));
 await setCourseExpectedParticipants(course.id,{ expectedRevision: result.revision, expectedParticipantsPre: 1, expectedParticipantsPost: 1 },admin.id);
 result = await courseResults(course.id,{},admin.id);
 const published = await publishCourseEdition(course.id,{ expectedRevision: result.revision, expectedVersion: 0 },admin.id);
 assert.equal(published.snapshot.result.aggregates.find(row => row.level === "category")?.standardDeviation?.method, "sample");
 assert.equal(published.snapshot.result.aggregates.find(row => row.level === "category")?.standardDeviation?.pre.n, 1);
 assert.equal(published.snapshot.result.aggregates.find(row => row.level === "category")?.standardDeviation?.pre.value, null);
 assert.equal(published.version,1); assert.equal(published.snapshot.document.data.kpis.overallImprovement,-50); assert.equal(published.snapshot.component,"learning");
 assert.equal((await publishedCourseReport(published.id,viewer.id)).id,published.id);
 const viewerOptions = await publishedReportFilterOptions(viewer.id);
 assert.deepEqual(viewerOptions.sites.map(item => item.id), [site.id]);
 assert.ok(viewerOptions.definitions.some(item => item.id === definition.id));
 assert.ok(viewerOptions.publications.some(item => item.id === published.id));
 const deniedOptions = await publishedReportFilterOptions(denied.id);
 assert.ok(!deniedOptions.definitions.some(item => item.id === definition.id));
 assert.ok(!deniedOptions.publications.some(item => item.id === published.id));

 assert.equal((await publishedCourseReport(published.id,operator.id)).id,published.id);
 assert.equal((await listPublishedCourseReports({},operator.id)).rows.some(row => row.id === published.id),true);
 assert.equal((await listPublishedCourseReports({},viewer.id)).rows.some(row => row.id === published.id),true);
 await assert.rejects(() => publishedCourseReport(published.id,denied.id),{ statusCode: 404 });
 assert.equal((await listPublishedCourseReports({},denied.id)).total,0);
 await prisma.user.update({ where: { id: viewer.id }, data: { excludedSurveyDefinitionIds: [definition.id] } });
 await assert.rejects(() => publishedCourseReport(published.id,viewer.id),{ statusCode: 404 });
 assert.equal((await listPublishedCourseReports({},viewer.id)).total,0);
 await prisma.user.update({ where: { id: viewer.id }, data: { excludedSurveyDefinitionIds: [] } });
 await assert.rejects(() => prisma.courseEditionPublication.update({ where: { id: published.id }, data: { name: "Altered" } }));
 await assert.rejects(() => prisma.courseEditionPublication.delete({ where: { id: published.id } }));
 await assert.rejects(() => publishCourseEdition(course.id,{ expectedRevision: result.revision, expectedVersion: 0 },admin.id),{ statusCode: 409 });
 await assert.rejects(() => publishCourseEdition(course.id,{ expectedRevision: 0, expectedVersion: 1 },admin.id),{ statusCode: 409 });
 await saveCourseReportDraft(course.id,{ expectedRevision: result.revision, draft: { templateKey: "course-impacts-2026mx-ncssm", textContent: { studentQuote: "Texto de segunda versión" } } },admin.id);
 result = await courseResults(course.id,{},admin.id);
 const concurrent = await Promise.allSettled([1,2].map(() => publishCourseEdition(course.id,{ expectedRevision: result.revision, expectedVersion: 1 },admin.id)));
 assert.equal(concurrent.filter(value => value.status === "fulfilled").length,1);
 assert.equal((await courseReportHistory(course.id,{},viewer.id)).total,2);
 assert.deepEqual(await publishedCourseReport(published.id,viewer.id),published,"Later draft and publication must not change saved data, template or texts");
 const original = JSON.stringify(published.snapshot);
 const row = await prisma.submission.findUniqueOrThrow({ where: { id: pre.submissionId } }); await setSubmissionExclusion(row.id,true,admin.id,row.contextRevision);
 assert.equal(JSON.stringify((await publishedCourseReport(published.id,viewer.id)).snapshot),original,"Later response exclusion cannot rewrite published results");
 const server = createApp().listen(0,"127.0.0.1"); await new Promise<void>(resolve => server.once("listening",resolve));
 try {
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}/api/surveys`;
  const token = (user: typeof viewer) => jwt.sign({ sub: user.id, role: user.role.toLowerCase(), username: user.username, organizationId: user.organizationId, featureKeys: [] },env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token(viewer)}` };
  assert.equal((await fetch(base+"/published-courses")).status,401);
  assert.equal((await fetch(base+"/internal-course-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseIds: [course.id] }) })).status, 401);
  assert.equal((await fetch(base+"/internal-course-report", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ courseIds: [course.id] }) })).status, 403);
  assert.equal((await fetch(base+"/published-courses",{ headers })).status,200);
  assert.equal((await fetch(base+"/published-courses",{ headers: { Authorization: `Bearer ${token(operator)}` } })).status,200);
  assert.equal((await fetch(base+"/published-courses/"+published.id,{ headers })).status,200);
  assert.equal((await fetch(base+"/courses/"+course.id+"/report-draft",{ headers })).status,403);
  assert.equal((await fetch(base+"/courses/"+course.id+"/publications",{ method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: result.revision, expectedVersion: 2 }) })).status,403);
  assert.equal((await fetch(base+"/published-courses/"+published.id,{ headers: { Authorization: `Bearer ${token(denied)}` } })).status,404);
 } finally { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())); }
 assert.equal(await prisma.auditLog.count({ where: { action: "COURSE_REPORT_PUBLISH", targetId: course.id } }),2);

 const closing = await prisma.courseEdition.create({ data: { siteId: site.id, primaryDefinitionId: definition.id, school: "Escuela cierre", activity: "Visita", name: "Cierre", status: "REVIEWED", expectedParticipantsPre: 2, expectedParticipantsPost: 2, createdBy: admin.id } });
 const closingResponses = [];
 for (const moment of ["PRE","POST"] as const) {
  const saved = await surveysService.ingest({ formID: definition.jotformFormId, submissionID: `closing-${moment}`, surveyMoment: moment, answers: [{ questionId: "school", value: `${moment === "PRE" ? "01" : "03"}/11/2026 - Escuela cierre` }, { questionId: "scale", value: "Alto" }] });
  closingResponses.push({ id: saved.submissionId, contextRevision: 0 });
 }
 await setCourseMembership(closing.id, { expectedRevision: 0, linked: true, responses: closingResponses }, admin.id);
 const combinedCourse = await prisma.courseEdition.create({ data: { siteId: site.id, primaryDefinitionId: definition.id, school: "Escuela combinada", activity: "Visita", name: "Curso combinado", status: "REVIEWED", createdBy: admin.id } });
 const combinedResponses = [];
 for (const moment of ["PRE", "POST"] as const) {
  const saved = await surveysService.ingest({ formID: definition.jotformFormId, submissionID: `internal-${moment}`, surveyMoment: moment, answers: [{ questionId: "school", value: "01/11/2026 - Escuela combinada" }, { questionId: "scale", value: "Alto" }] });
  combinedResponses.push({ id: saved.submissionId, contextRevision: 0 });
 }
 await setCourseMembership(combinedCourse.id, { expectedRevision: 0, linked: true, responses: combinedResponses }, admin.id);
 const combinedInternal = await internalCourseReport({ courseIds: [closing.id, combinedCourse.id] }, admin.id);
 assert.equal(combinedInternal.courses.length, 2);
 const internalContext = combinedInternal.template.blocks.find(block => block.id === "course-review-context");
 assert.ok(internalContext?.type === "text" && internalContext.content?.includes("Envíos Pre: 2; Post: 2"));
 assert.equal(await prisma.courseEditionPublication.count({ where: { courseId: combinedCourse.id } }), 0);
 const beforeInternalPublications = await prisma.courseEditionPublication.count({ where: { courseId: closing.id } });
 const internal = await internalCourseReport({ courseIds: [closing.id] }, admin.id);
 assert.equal(internal.courses[0]?.id, closing.id); assert.ok(internal.template.title.includes("Consulta interna"));
 assert.equal(await prisma.courseEditionPublication.count({ where: { courseId: closing.id } }), beforeInternalPublications);
 await assert.rejects(() => internalCourseReport({ courseIds: [closing.id] }, denied.id), { statusCode: 403 });
 await assert.rejects(() => internalCourseReport({ courseIds: [course.id, course.id] }, admin.id));
 let closingResult = await courseResults(closing.id, {}, admin.id);
 await assert.rejects(() => publishCourseEdition(closing.id, { expectedRevision: closingResult.revision, expectedVersion: 0 }, admin.id, true), error => error instanceof Error && error.message.includes("80%"));
 assert.equal((await prisma.courseEdition.findUniqueOrThrow({ where: { id: closing.id } })).status, "REVIEWED");
 assert.equal((await prisma.courseEdition.findUniqueOrThrow({ where: { id: closing.id } })).reportDraft, null);
 assert.equal(await prisma.courseEditionPublication.count({ where: { courseId: closing.id } }), 0);
 await setCourseExpectedParticipants(closing.id, { expectedRevision: closingResult.revision, expectedParticipantsPre: 1, expectedParticipantsPost: 1 }, admin.id);
 closingResult = await courseResults(closing.id, {}, admin.id);
 const closingRequests = await Promise.allSettled([1,2].map(() => publishCourseEdition(closing.id, { expectedRevision: closingResult.revision, expectedVersion: 0 }, admin.id, true)));
 assert.equal(closingRequests.filter(value => value.status === "fulfilled").length, 1);
 assert.equal((await prisma.courseEdition.findUniqueOrThrow({ where: { id: closing.id } })).status, "COMPLETED");
 const frozen = await courseResults(closing.id, {}, admin.id);
 assert.equal(frozen.preReceipts, 1); assert.equal(frozen.postReceipts, 1);
 assert.equal(await prisma.courseEditionPublication.count({ where: { courseId: closing.id } }), 1);
 const completedPre = await prisma.submission.findUniqueOrThrow({ where: { id: closingResponses[0]!.id } });
 await assert.rejects(() => setSubmissionMoment(completedPre.id, "POST", admin.id, completedPre.contextRevision), { statusCode: 409 });
 await assert.rejects(() => setSubmissionExclusion(completedPre.id, true, admin.id, completedPre.contextRevision), { statusCode: 409 });
 await assert.rejects(() => setSubmissionContext(completedPre.id, { expectedRevision: completedPre.contextRevision, context: { school: "Otra", date: "2026-11-01" } }, admin.id), { statusCode: 409 });
 await assert.rejects(() => setCourseExpectedParticipants(closing.id, { expectedRevision: frozen.revision + 1, expectedParticipantsPre: 10, expectedParticipantsPost: 10 }, admin.id), { statusCode: 409 });
 const late = await surveysService.ingest({ formID: definition.jotformFormId, submissionID: "closing-late", surveyMoment: "PRE", answers: [{ questionId: "school", value: "01/11/2026 - Escuela cierre" }, { questionId: "scale", value: "Bajo" }] });
 await prisma.$transaction(tx => groupMigratedCourseResponse(tx, definition.id, "closing-late"));
 assert.notEqual((await prisma.courseMembership.findUnique({ where: { submissionId: late.submissionId }, include: { application: true } }))?.application.courseId, closing.id);
 assert.deepEqual(await courseResults(closing.id, {}, admin.id), frozen);
 assert.deepEqual(await courseResults(closing.id, { from: "2027-01-01" }, admin.id), frozen);

 const selectedDefinition = await prisma.surveyDefinition.create({ data: {
  jotformFormId: "publication-categories", siteId: site.id, instrumentKind: "LEARNING", configurationVersion: 4, activityName: "Visita",
  analysisWeights: [{ analysisType: "pre_post", categoryWeights: [{category:"A",weight:20},{category:"B",weight:30},{category:"C",weight:50}], subcategoryWeights: ["A","B","C"].map(category=>({category,subcategory:"Base",weight:100})) }],
  questions: { create: [
   {externalId:"school",text:"Escuela",type:"OPEN_TEXT",role:"SCHOOL_GROUP"},
   ...["A","B","C"].map(category=>({ externalId:category,text:"Pregunta "+category,type:"LIKERT" as const,role:"SCORED" as const,options:["Alto","Bajo"],classification:{category,subcategory:"Base"},analysisParticipation:[{analysisType:"pre_post",enabled:true},{analysisType:"pre_post_post",enabled:false}],analysisScoring:[{analysisType:"pre_post",maxScore:10,scoringMode:"ordered_scale",scaleOptions:["Alto","Bajo"],inverse:false,responsePolicy:{blank:"exclude",invalid:"review"}}] })),
  ] },
 } });
 const selectedCourse = await prisma.courseEdition.create({ data: { siteId:site.id, primaryDefinitionId:selectedDefinition.id, school:"Escuela categorías",activity:"Visita",name:"Categorías seleccionadas",status:"REVIEWED",expectedParticipantsPre:1,expectedParticipantsPost:1,createdBy:admin.id } });
 const categoryResponses = [];
 for (const moment of ["PRE","POST"] as const) {
  const saved = await surveysService.ingest({formID:selectedDefinition.jotformFormId,submissionID:"categories-"+moment,surveyMoment:moment,answers:[
   {questionId:"school",value:"01/11/2026 - Escuela categorías"},
   {questionId:"A",value:moment==="PRE"?"Alto":"Bajo"},
   {questionId:"B",value:"Respuesta inválida"},
   {questionId:"C",value:"Alto"},
  ]});
  categoryResponses.push({id:saved.submissionId,contextRevision:0});
 }
 await setCourseMembership(selectedCourse.id,{expectedRevision:0,linked:true,responses:categoryResponses},admin.id);
 let categoryResult = await courseResults(selectedCourse.id,{},admin.id);
 await saveCourseReportDraft(selectedCourse.id,{expectedRevision:categoryResult.revision,draft:{templateKey:"course-impacts-general",textContent:{},categories:["A"]}},admin.id);
 assert.deepEqual((await getCourseReportDraft(selectedCourse.id,admin.id)).draft.categories,["A"]);
 categoryResult = await courseResults(selectedCourse.id,{},admin.id);
 await assert.rejects(()=>saveCourseReportDraft(selectedCourse.id,{expectedRevision:categoryResult.revision,draft:{templateKey:"course-impacts-general",textContent:{},categories:["Unknown"]}},admin.id),{statusCode:400});
 await assert.rejects(()=>publishCourseEdition(selectedCourse.id,{expectedRevision:categoryResult.revision,expectedVersion:0,categories:["Unknown"]},admin.id,true),{statusCode:400});
 await assert.rejects(()=>publishCourseEdition(selectedCourse.id,{expectedRevision:categoryResult.revision,expectedVersion:0,categories:["A","B","C"]},admin.id,true),{statusCode:409});
 assert.equal(await prisma.courseEditionPublication.count({where:{courseId:selectedCourse.id}}),0);
 const selectedPublication = await publishCourseEdition(selectedCourse.id,{expectedRevision:categoryResult.revision,expectedVersion:0,categories:["A"]},admin.id,true);
 assert.deepEqual(selectedPublication.snapshot.result.categorySelection,{included:["A"],excluded:["B","C"]});
 assert.deepEqual(selectedPublication.snapshot.draft.categories,["A"]);
 assert.ok(selectedPublication.snapshot.result.questions.every(row=>row.category==="A"));
 assert.ok(selectedPublication.snapshot.result.groups.every(row=>row.category==="A"));
 assert.ok(selectedPublication.snapshot.result.aggregates.every(row=>row.category==="A"||row.level==="index"));
 assert.equal(selectedPublication.snapshot.result.aggregates.find(row=>row.level==="index")?.change,-50);
 assert.ok(selectedPublication.snapshot.document.data.tables.categoryBreakdown?.every(row=>row.name==="A"));
 assert.deepEqual((await courseResults(selectedCourse.id,{},admin.id)).categorySelection,{included:["A"],excluded:["B","C"]});
 const zeroDefinition = await prisma.surveyDefinition.create({ data: { jotformFormId: "zero-initial", siteId: site.id, instrumentKind: "LEARNING", instrumentName: "Inicial cero", activityName: "Visita", configurationVersion: 4, analysisWeights: [{ analysisType: "pre_post", categoryWeights: [{ category: "Learning", weight: 100 }], subcategoryWeights: [{ category: "Learning", subcategory: "Knowledge", weight: 100 }] }], questions: { create: [
  { externalId: "school", text: "Escuela", type: "OPEN_TEXT", role: "SCHOOL_GROUP" },
  { externalId: "correct", text: "Correcta", type: "ONE_ANSWER", role: "SCORED", options: ["A", "B"], classification: { category: "Learning", subcategory: "Knowledge" }, analysisParticipation: [{ analysisType: "pre_post", enabled: true }, { analysisType: "pre_post_post", enabled: false }], analysisScoring: [{ analysisType: "pre_post", maxScore: 1, correctAnswer: "A", scoringMode: "standard", responsePolicy: { blank: "exclude", invalid: "review" } }] },
 ] } } });
 const zeroRows = [];
 for (const moment of ["PRE", "POST"] as const) {
  const response = await surveysService.ingest({ formID: zeroDefinition.jotformFormId, submissionID: `zero-initial-${moment}`, surveyMoment: moment, answers: [{ questionId: "school", value: "11/01/2026 - Escuela cero" }, { questionId: "correct", value: moment === "PRE" ? "B" : "A" }] });
  zeroRows.push({ id: response.submissionId, contextRevision: 0 });
 }
 const zeroCourse = await createCourseEdition({ siteId: site.id, primaryDefinitionId: zeroDefinition.id, school: "Escuela cero", activity: "Visita", name: "Inicial cero", expectedParticipants: 1 }, admin.id);
 await setCourseMembership(zeroCourse.id, { expectedRevision: 0, linked: true, responses: zeroRows }, admin.id);
 const zeroResult = await courseResults(zeroCourse.id, {}, admin.id);
 const zeroIndex = zeroResult.aggregates.find(row => row.level === "index")!;
 assert.equal(zeroIndex.pre, 0); assert.equal(zeroIndex.post, 100); assert.equal(zeroIndex.change, null);
 await saveCourseReportDraft(zeroCourse.id, { expectedRevision: zeroResult.revision, draft: { templateKey: "course-impacts-general", textContent: {} } }, admin.id);
 const zeroPublication = await publishCourseEdition(zeroCourse.id, { expectedRevision: zeroResult.revision + 1, expectedVersion: 0 }, admin.id);
 assert.equal(zeroPublication.snapshot.result.aggregates.find(row => row.level === "index")?.change, null);
 assert.equal(zeroPublication.snapshot.document.data.kpis.overallImprovement, "No disponible (Pre es cero o faltan datos)");
 assert.deepEqual(await publishedCourseReport(published.id, viewer.id), published, "A new publication does not rewrite an earlier snapshot");
 const legacySnapshot = structuredClone(published.snapshot);
 legacySnapshot.result.aggregates.find(row => row.level === "index")!.change = 17;
 legacySnapshot.document.data.kpis.overallImprovement = 17;
 const legacyRow = await prisma.courseEditionPublication.create({ data: { courseId: zeroCourse.id, version: 99, actorId: admin.id, name: "Histórico", school: "Escuela cero", surveyDefinitionIds: [zeroDefinition.id], snapshot: legacySnapshot as any } });
 const legacyRead = await publishedCourseReport(legacyRow.id, viewer.id);
 assert.deepEqual(legacyRead.snapshot, legacySnapshot, "Historical snapshots retain their original values and document");

 console.log("E6 publication passed: approved aggregate, coverage gate, saved draft, frozen template/data/text, scope/readers, immutable database, concurrent republication and HTTP authorization");
} finally { await prisma.$disconnect(); }
