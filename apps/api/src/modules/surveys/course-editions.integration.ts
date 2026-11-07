import jwt from "jsonwebtoken";
import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import assert from "node:assert/strict";
import { prisma } from "../../db/prisma.js";
import { confirmCourseSelection, groupMigratedCourseResponse, splitCourseApplication, createCourseEdition, courseEditionDetail, courseResponseCandidates, courseOptions, listCourseEditions, setCourseInstrument, courseComplementResults, setCourseMembership } from "./course-editions.service.js";
import { migrateAssistantResponses } from "./assistant-migration.service.js";
import { jotformClient } from "./jotform-client.js";
import { surveysService, groupSearch, courseDetail, setSubmissionContext, setSubmissionExclusion, setSubmissionMoment } from "./surveys.service.js";
import { persistResults } from "./surveys.repository.js";
import { responseFingerprint, responseGroupingContext } from "./response-context.js";
assert.equal(process.env.NODE_ENV, "test");
assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/epi_setup_test");
try {
 const admin = await prisma.user.create({ data: { username: "courses_admin", name: "Courses admin", email: "courses-admin@example.test", password: "unused", role: "SYSTEM_ADMIN" } });
 const org = await prisma.organization.create({ data: { name: "Courses integration" } });
 const site = await prisma.site.create({ data: { name: "Courses site", organizationId: org.id } });
 const other = await prisma.site.create({ data: { name: "Other courses site", organizationId: org.id } });
 const scoped = await prisma.user.create({ data: { username: "courses_scoped", name: "Scoped", email: "courses-scoped@example.test", password: "unused", role: "FUNCTIONALITY_USER", organizationId: org.id, siteIds: [other.id] } });
 async function definition(kind: string, siteId = site.id, programName = "EPI") { return prisma.surveyDefinition.create({ data: { siteId, jotformFormId: `courses-${kind}-${siteId}-${programName}`, instrumentKind: kind, instrumentName: kind, activityName: "Visita", programName, configurationVersion: 4 } }); }
 const learning = await definition("LEARNING"); const cqs = await definition("CQS"); const follow = await definition("FOLLOW_UP"); const foreign = await definition("LEARNING", other.id); const differentProgram = await definition("CQS", site.id, "Other");
 async function response(remote: string, definitionId: string, moment: "PRE" | "POST" | "CQS" | "POST_POST", day: string) { return prisma.submission.create({ data: { jotformSubmissionId: remote, surveyDefinitionId: definitionId, surveyMoment: moment, responseFingerprint: responseFingerprint(definitionId, [{ questionId: "score", value: 1 }]), rawJsonData: { participant: { school: `${day}/11/2026 - Escuela E4`, age: 18, gender: "F" }, answers: [{ questionId: "score", value: 1 }] } } }); }
 const pre = await response("courses-pre", learning.id, "PRE", "01"); const post = await response("courses-post", learning.id, "POST", "05"); const quality = await response("courses-cqs", cqs.id, "CQS", "05"); const quality2 = await response("courses-cqs-2", cqs.id, "CQS", "05"); const later = await response("courses-follow", follow.id, "POST_POST", "20"); const outside = await response("courses-other", foreign.id, "PRE", "01");
 const input = { siteId: site.id, primaryDefinitionId: learning.id, name: "Edición noviembre", school: "Escuela E4", activity: "Visita" };
 await assert.rejects(() => createCourseEdition({ ...input, school: "Escuela inexistente" }, admin.id));
 await assert.rejects(() => createCourseEdition(input, scoped.id));
 const course = await createCourseEdition(input, admin.id); const second = await createCourseEdition({ ...input, name: "Otra edición" }, admin.id);
 assert.equal((await courseEditionDetail(course.id, 1, admin.id)).totalResponses, 0);
 await assert.rejects(() => courseEditionDetail(course.id, 1, scoped.id), { statusCode: 404 });
 assert.equal((await listCourseEditions({}, scoped.id)).total, 0);
 assert.equal((await listCourseEditions({ siteId: site.id, school: "escuela e4", activity: "VISITA" }, admin.id)).total, 2);
 assert.equal((await listCourseEditions({ school: "inexistente" }, admin.id)).total, 0);
 assert.equal((await listCourseEditions({ school: "escuela e4" }, scoped.id)).total, 0);
 assert.ok(!(await courseOptions(scoped.id)).definitions.some(d => d.id === learning.id));
 let candidates = await courseResponseCandidates(course.id, {}, admin.id);
 assert.ok(!candidates.rows.some(r => r.id === outside.id)); assert.ok(candidates.rows.find(r => r.id === pre.id)!.possibleDuplicate); assert.equal(candidates.rows.find(r => r.id === pre.id)!.reviewExcluded, false);
 assert.equal(candidates.rows.find(r => r.id === quality.id)!.canLink, false);
 const membership = async (ids: string[], linked = true, courseId = course.id) => { const current = await courseEditionDetail(courseId, 1, admin.id); const rows = await prisma.submission.findMany({ where: { id: { in: ids } } }); return setCourseMembership(courseId, { expectedRevision: current.revision, linked, responses: rows.map(r => ({ id: r.id, contextRevision: r.contextRevision })) }, admin.id); };
 await membership([pre.id, post.id]);
 let detail = await courseEditionDetail(course.id, 1, admin.id);
 assert.equal(detail.applications.length, 2); assert.deepEqual(detail.applications.map(a => a.date), ["2026-11-01", "2026-11-05"]); assert.equal(detail.totalResponses, 2);
 const original = (await prisma.submission.findUniqueOrThrow({ where: { id: pre.id } })).rawJsonData;
 await assert.rejects(() => membership([pre.id], true, second.id), { statusCode: 409 });
 await assert.rejects(() => setCourseInstrument(course.id, { expectedRevision: detail.revision, definitionId: differentProgram.id, linked: true }, admin.id));
 await setCourseInstrument(course.id, { expectedRevision: detail.revision, definitionId: cqs.id, linked: true }, admin.id);
 assert.equal((await courseEditionDetail(course.id, 1, admin.id)).totalResponses, 2);
 assert.equal((await courseEditionDetail(second.id, 1, admin.id)).instruments.find(item => item.id === cqs.id)!.linked, false, "Complement belongs only to chosen edition");
 await assert.rejects(() => courseComplementResults(second.id, cqs.id, admin.id), { statusCode: 404 });
 await membership([quality.id]); assert.equal((await courseEditionDetail(course.id, 1, admin.id)).totalResponses, 3);
 assert.equal(await prisma.courseMembership.count({ where: { submissionId: quality2.id } }), 0);
 detail = await courseEditionDetail(course.id, 1, admin.id);
 await setCourseInstrument(course.id, { expectedRevision: detail.revision, definitionId: follow.id, linked: true }, admin.id); await membership([later.id]);
 const complementResult = await courseComplementResults(course.id, follow.id, admin.id);
 assert.equal(complementResult.receipts, 1); assert.equal(complementResult.kind, "FOLLOW_UP");
 assert.equal((await courseComplementResults(course.id, cqs.id, admin.id)).receipts, 1, "Unselected quality response stays outside results");
 assert.equal((await courseResponseCandidates(course.id, { definitionId: cqs.id, linked: "true" }, admin.id)).total, 1);
 await assert.rejects(() => courseComplementResults(course.id, follow.id, scoped.id), { statusCode: 404 });
 // Stale response in a batch must roll back both the course revision and earlier rows.
 detail = await courseEditionDetail(course.id, 1, admin.id); const revision = detail.revision; const preRevision = (await prisma.submission.findUniqueOrThrow({ where: { id: pre.id } })).contextRevision;
 await assert.rejects(() => setCourseMembership(course.id, { expectedRevision: revision, linked: true, responses: [{ id: pre.id, contextRevision: preRevision }, { id: quality2.id, contextRevision: 999 }] }, admin.id), { statusCode: 409 });
 assert.equal((await courseEditionDetail(course.id, 1, admin.id)).revision, revision); assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: pre.id } })).contextRevision, preRevision);
 await setSubmissionContext(pre.id, { expectedRevision: preRevision, context: { school: "Escuela E4", date: "2026-11-02", activity: "Visita", gender: "Otro", age: 0 } }, admin.id);
 await assert.rejects(() => setSubmissionContext(pre.id, { expectedRevision: preRevision, context: null }, admin.id), { statusCode: 409 });
 detail = await courseEditionDetail(course.id, 1, admin.id); assert.ok(detail.responses.find(r => r.id === pre.id)!.issues.some(i => i.startsWith("El contexto cambió")));
 await membership([pre.id]); detail = await courseEditionDetail(course.id, 1, admin.id); assert.deepEqual(detail.responses.find(r => r.id === pre.id)!.issues, []);
 assert.equal(detail.responses.find(r => r.id === pre.id)!.context.age, 0);
 assert.deepEqual((await prisma.submission.findUniqueOrThrow({ where: { id: pre.id } })).rawJsonData, original);
 let current = await prisma.submission.findUniqueOrThrow({ where: { id: post.id } });
 await setSubmissionExclusion(post.id, true, admin.id, current.contextRevision); detail = await courseEditionDetail(course.id, 1, admin.id); assert.equal(detail.applications.reduce((n,a) => n+a.excludedCount,0),1);
 current = await prisma.submission.findUniqueOrThrow({ where: { id: post.id } }); await setSubmissionExclusion(post.id, false, admin.id, current.contextRevision);
 current = await prisma.submission.findUniqueOrThrow({ where: { id: later.id } }); await setSubmissionMoment(later.id, "POST_POST", admin.id, current.contextRevision);
 detail = await courseEditionDetail(course.id, 1, admin.id); await setCourseInstrument(course.id, { expectedRevision: detail.revision, definitionId: cqs.id, linked: false }, admin.id);
 detail = await courseEditionDetail(course.id, 1, admin.id); assert.ok(detail.responses.find(r => r.id === quality.id)!.issues.includes("Vincular primero el instrumento complementario")); assert.equal(detail.totalResponses, 4);
 await membership([quality.id], false); assert.equal((await courseEditionDetail(course.id, 1, admin.id)).totalResponses, 3); assert.ok(await prisma.submission.findUnique({ where: { id: quality.id } }));
 await membership([post.id], false); await membership([post.id], true, second.id);
 // Concurrent confirmations using the same version have exactly one winner.
 const state = await courseEditionDetail(second.id, 1, admin.id); current = await prisma.submission.findUniqueOrThrow({ where: { id: post.id } });
 const concurrent = await Promise.allSettled([1,2].map(() => setCourseMembership(second.id, { expectedRevision: state.revision, linked: false, responses: [{ id: post.id, contextRevision: current.contextRevision }] }, admin.id)));
 assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);
 assert.ok(await prisma.auditLog.count({ where: { targetId: course.id, action: "COURSE_RESPONSES_LINK" } })); assert.equal(await prisma.aggregatedResult.count({ where: { submissionId: pre.id } }), 0);
 // Historical API and webhook shapes must produce the same typed context.
 const fields = [{ externalId: "q1_school", role: "SCHOOL_GROUP" as const }, { externalId: "q2_activity", role: "ACTIVITY" as const }, { externalId: "q3_gender", role: "GENDER" as const }, { externalId: "q4_age", role: "AGE" as const }];
 for (const field of fields) await prisma.question.create({ data: { ...field, surveyDefinitionId: learning.id, text: field.externalId, type: "OPEN_TEXT" } });
 const values = ["01/11/2026 - Escuela E4", "Visita", "Otro", "0"];
 const historical = { id: "courses-historical", form_id: learning.jotformFormId, created_at: "2026-11-01T23:30:00Z", answers: Object.fromEntries(fields.map((f,i) => [String(i+1), { name: f.externalId, type: "control_textbox", answer: values[i] }])) };
 const webhook = { formID: learning.jotformFormId, submissionID: "courses-webhook", created_at: historical.created_at, rawRequest: JSON.stringify(Object.fromEntries(fields.map((f,i) => [f.externalId, values[i]]))) };
 const a = await surveysService.ingest(historical); const b = await surveysService.ingest(webhook);
 const receipts = await prisma.submission.findMany({ where: { id: { in: [a.submissionId,b.submissionId] } }, include: { surveyDefinition: true } });
 assert.equal(receipts.length, 2); assert.deepEqual(responseGroupingContext(receipts[0]!), responseGroupingContext(receipts[1]!)); assert.equal(responseGroupingContext(receipts[0]!).age, 0);
 assert.equal(await prisma.answer.count({ where: { submissionId: a.submissionId } }), 4);
 await surveysService.ingest(historical); assert.equal(await prisma.submission.count({ where: { jotformSubmissionId: "courses-historical" } }), 1);
 assert.equal(await prisma.answer.count({ where: { submissionId: a.submissionId } }), 4);
 assert.equal(await persistResults({ submissionId: a.submissionId, surveyDefinitionId: learning.id, expectedRevision: 0, participantId: undefined, isDuplicate: false, answers: [], results: [] }), false);
 assert.equal(await prisma.answer.count({ where: { submissionId: a.submissionId } }), 4);
 for (const [definition, expected] of [[follow,"POST_POST"],[cqs,"CQS"]] as const) {
  await prisma.question.create({data:{surveyDefinitionId:definition.id,externalId:"school",text:"Escuela",type:"OPEN_TEXT",role:"SCHOOL_GROUP"}});
  const added = await surveysService.ingest({id:`kind-fallback-${expected}`,form_id:definition.jotformFormId,answers:{"1":{name:"school",type:"control_textbox",answer:"01/11/2026 - Escuela E4"}}});
  assert.equal((await prisma.submission.findUniqueOrThrow({where:{id:added.submissionId}})).surveyMoment,expected,"Complementary kind supplies moment when there is no MOMENT question");
 }
 // Run the actual import against a fake Jotform page. Saved versioned responses can still be pending in the old processor.
 const auto = await definition("LEARNING", site.id, "Automático");
 const account = await prisma.jotformAccount.create({ data: { name: "Fake automatic migration", apiKey: "isolated-test-key" } });
 await prisma.jotformForm.create({ data: { id: auto.jotformFormId, title: "Migración automática", status: "ACTIVE", accountId: account.id } });
 await prisma.question.createMany({ data: [
  { surveyDefinitionId: auto.id, externalId: "school", text: "Escuela", type: "OPEN_TEXT", role: "SCHOOL_GROUP" },
  { surveyDefinitionId: auto.id, externalId: "activity", text: "Actividad", type: "OPEN_TEXT", role: "ACTIVITY" },
  { surveyDefinitionId: auto.id, externalId: "moment", text: "Momento", type: "ONE_ANSWER", role: "MOMENT", options: ["Antes","Después"], momentMappings: [{value:"Antes",moment:"PRE"},{value:"Después",moment:"POST"}] },
 ] });
 const payload = (id: string, school: string | { other: string }, activity: string, moment: string, created_at = "2026-12-01T20:00:00Z") => ({ id, form_id: auto.jotformFormId, created_at, answers: {
  "1": { name: "school", type: "control_textbox", answer: school },
  "2": { name: "activity", type: "control_textbox", answer: activity },
  "3": { name: "moment", type: "control_radio", answer: moment },
 } });
 const importRows = [
  payload("auto-pre", "02/11/2025 - Escuela auto", "Visita", "Antes"),
  payload("auto-post", "02/11/2025 - ESCUELA AUTO", "Visita", "Después"),
  payload("auto-next", "04/11/2025 - Escuela auto", "Visita", "Antes"),
  payload("auto-other", "02/11/2025 - Escuela auto", "Taller", "Antes"),
  payload("auto-unknown", "02/11/2025 - Escuela auto", "Visita", "Otro"),
  payload("auto-source-pre", "Escuela auto", "Visita", "Antes", "2026-12-02 01:05:00"),
  payload("auto-source-post", { other: "Escuela auto" }, "Visita", "Después", "2026-12-02T23:55:00-07:00"),
  payload("auto-no-school", "", "Visita", "Después", "2026-12-02 23:55:00"),
 ];
 const oldPage = jotformClient.listSubmissionPage;
 jotformClient.listSubmissionPage = async (_form, _key, filters) => importRows.slice(filters.offset ?? 0);
 try {
  const migrated = await migrateAssistantResponses(auto.id);
  assert.equal(migrated.total, 8); assert.equal(migrated.pending, 8);
  const sourceDate = await listCourseEditions({ school: "escuela auto", year: 2026, moment: "BOTH" }, admin.id);
  assert.equal(sourceDate.total, 1);
  assert.equal(sourceDate.rows[0]?.applicationDate, "2026-12-02");
  assert.equal(sourceDate.rows[0]?.preResponses, 1);
  assert.equal(sourceDate.rows[0]?.postResponses, 1);
  const filters = { siteId: site.id, surveyDefinitionId: auto.id };
  const review = await groupSearch({ ...filters, from: "2026-12-02", to: "2026-12-02" }, admin.id);
  const schoolGroup = review.rows.find(row => row.school === "Escuela auto");
  assert.equal(schoolGroup?.savedCount, 3);
  assert.equal(schoolGroup?.studentsResponded, 2);
  assert.equal(schoolGroup?.contextNeedsReview, true);
  assert.equal(review.totalGroups, 1);
  assert.equal(schoolGroup?.pendingCount, 0);

  const detail = await courseDetail({ ...filters, school: "Escuela auto", date: "2026-12-02" }, admin.id);
  assert.equal(detail.length, 2);
  const dailyDetail = await courseDetail({ ...filters, school: schoolGroup!.school, date: "2026-12-02", groupId: schoolGroup!.id }, admin.id);
  assert.equal(dailyDetail.length, 3, "Daily detail includes all schools and missing school");

  assert.ok(detail.every(row => row.savedForCourse && row.schoolContext?.groupingDate === "2026-12-02"));
  const summary = await listCourseEditions({ school: "escuela auto", year: 2025 }, admin.id);
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.rows.map(item => item.applicationDate), ["2025-11-04","2025-11-02","2025-11-02"]);
  const both = await listCourseEditions({ school: "escuela auto", year: 2025, moment: "BOTH", submittedOn: "2026-12-01" }, admin.id);
  assert.equal(both.total, 1);
  const autoCourse = both.rows[0]!;
  assert.equal(autoCourse.preResponses, 1); assert.equal(autoCourse.postResponses, 1);
  assert.equal(autoCourse.expectedParticipantsPre, null);
  assert.equal((await listCourseEditions({ school: "escuela auto", submittedOn: "2025-11-02" }, admin.id)).total, 0);
  assert.equal((await listCourseEditions({ school: "escuela auto", year: 2025 }, scoped.id)).total, 0);
  const autoPre = await prisma.submission.findUniqueOrThrow({ where: { jotformSubmissionId: "auto-pre" } });
  await membership([autoPre.id], false, autoCourse.id);
  await migrateAssistantResponses(auto.id);
  assert.equal(await prisma.courseEdition.count({ where: { primaryDefinitionId: auto.id } }), 4);
  assert.equal(await prisma.courseMembership.count({ where: { submissionId: autoPre.id } }), 0, "A manual unlink is preserved after retry");
  assert.equal((await courseEditionDetail(autoCourse.id, 1, admin.id)).totalResponses, 1);
  const originalEdition = await courseEditionDetail(sourceDate.rows[0]!.id, 1, admin.id);
  const splitPost = originalEdition.applications.find(item => item.moment === "POST")!;
  await assert.rejects(() => splitCourseApplication(originalEdition.id, splitPost.id, { expectedRevision: originalEdition.revision }, scoped.id), { statusCode: 404 });
  const separated = await splitCourseApplication(originalEdition.id, splitPost.id, { expectedRevision: originalEdition.revision }, admin.id);
  assert.equal((await courseEditionDetail(separated.courseId, 1, admin.id)).totalResponses, 1);
  assert.equal((await courseEditionDetail(originalEdition.id, 1, admin.id)).totalResponses, 1);
  await assert.rejects(() => splitCourseApplication(originalEdition.id, splitPost.id, { expectedRevision: originalEdition.revision }, admin.id), { statusCode: 409 });
  await migrateAssistantResponses(auto.id);
  assert.equal((await courseEditionDetail(separated.courseId, 1, admin.id)).totalResponses, 1);

 } finally { jotformClient.listSubmissionPage = oldPage; }
 const confirmedPre = await surveysService.ingest({ ...payload("confirm-pre", "Escuela confirmada", "Visita", "Antes", "2026-10-01 10:00:00") });
 const confirmedPost = await surveysService.ingest({ ...payload("confirm-post", "Otra escuela", "Visita", "Después", "2026-10-03 10:00:00") });
 const confirmedIds = [confirmedPre.submissionId, confirmedPost.submissionId];
 const originalPayloads = await prisma.submission.findMany({ where: { id: { in: confirmedIds } }, select: { id: true, rawJsonData: true }, orderBy: { id: "asc" } });
 const selection = { participants: 15, responses: confirmedIds.map(id => ({ id, contextRevision: 0 })) };
 await assert.rejects(() => confirmCourseSelection(selection, scoped.id));
 const reviewed = await confirmCourseSelection(selection, admin.id);
 assert.equal((await prisma.courseEdition.findUniqueOrThrow({ where: { id: reviewed.courseId } })).status, "REVIEWED");
 assert.equal((await prisma.courseEdition.findUniqueOrThrow({ where: { id: reviewed.courseId } })).expectedParticipantsPre, 15);
 assert.deepEqual(await prisma.submission.findMany({ where: { id: { in: confirmedIds } }, select: { id: true, rawJsonData: true }, orderBy: { id: "asc" } }), originalPayloads);
 await assert.rejects(() => confirmCourseSelection(selection, admin.id), { statusCode: 409 });
 const reviewedSearch = await groupSearch({ siteId: site.id, surveyDefinitionId: auto.id, entryType: "courses", reviewStatus: "REVIEWED" }, admin.id);
 assert.equal(reviewedSearch.rows.filter(row => row.courseId === reviewed.courseId).length, 1);
 const reviewedRow = reviewedSearch.rows.find(row => row.courseId === reviewed.courseId)!;
 assert.equal(reviewedRow.preCount, 1); assert.equal(reviewedRow.postCount, 1);
 assert.equal((await courseDetail({ siteId: site.id, date: reviewedRow.date, school: reviewedRow.school, groupId: reviewed.courseId }, admin.id)).length, 2);
 const individuals = await groupSearch({ siteId: site.id, surveyDefinitionId: auto.id, entryType: "individual", from: "2026-10-01", to: "2026-10-03" }, admin.id);
 assert.equal(individuals.totalGroups, 0);
 const arrival = await surveysService.ingest(payload("confirm-later", "", "Visita", "Después", "2026-10-03 11:00:00"));
 await prisma.$transaction(tx => groupMigratedCourseResponse(tx, auto.id, "confirm-later"));
 assert.equal((await prisma.courseMembership.findUniqueOrThrow({ where: { submissionId: arrival.submissionId }, include: { application: true } })).application.courseId, reviewed.courseId);
 const beforeCorrection = await prisma.submission.findUniqueOrThrow({ where: { id: arrival.submissionId } });
 await setSubmissionMoment(arrival.submissionId, "PRE", admin.id, beforeCorrection.contextRevision);
 const correctedMembership = await prisma.courseMembership.findUniqueOrThrow({ where: { submissionId: arrival.submissionId }, include: { application: true } });
 assert.equal(correctedMembership.application.moment, "PRE");
 assert.equal(correctedMembership.application.courseId, reviewed.courseId);
 const server = createApp().listen(0, "127.0.0.1");
 await new Promise<void>(resolve => server.once("listening", resolve));
 try {
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/surveys/courses`;
  const token = (user: typeof admin) => jwt.sign({ sub: user.id, username: user.username, role: user.role.toLowerCase(), organizationId: user.organizationId, featureKeys: ["surveys"] }, env.JWT_SECRET);
  const request = (url: string, user = admin, method = "GET", body?: unknown) => fetch(url, { method, headers: { Authorization: `Bearer ${token(user)}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await request(base + "/options")).status, 200);
  assert.equal((await request(`${base}/${course.id}/complements/${follow.id}/results`)).status, 200);
  assert.equal((await request(`${base}/${course.id}/complements/${follow.id}/results`, scoped)).status, 404);
  assert.equal((await request(`${base}/${second.id}/complements/${follow.id}/results`)).status, 404);
  assert.equal((await request(base + "/" + course.id, scoped)).status, 404);
  assert.equal((await request(base, admin, "POST", {})).status, 400);
  assert.equal((await request(base + "/" + course.id + "/responses", admin, "PUT", { expectedRevision: 0, linked: true, responses: [{ id: pre.id, contextRevision: 0 }] })).status, 409);
  const viewer = await prisma.user.create({ data: { username: "courses_reader", name: "Reader", email: "courses-reader@example.test", password: "unused", role: "REPORT_VIEWER", organizationId: org.id, siteIds: [site.id] } });
  for (const [url, method] of [[base, "GET"], [base, "POST"], [`${base}/${course.id}/complements/${follow.id}/results`, "GET"], [base + "/options", "GET"], [base + "/" + course.id + "/responses", "PUT"]]) assert.equal((await request(url!, viewer, method)).status, 403);
 } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
 console.log("course editions integration passed: explicit dates, complementary subsets, scoped access, atomic revisions, audit and reversible links");
} finally { await prisma.$disconnect(); }
