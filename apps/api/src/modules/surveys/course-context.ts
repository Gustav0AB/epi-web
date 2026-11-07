import type { ResponseGroupingContext } from "@epi/shared";
const normalized = (value: string | null) => value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
export function courseResponseIssues(course: { id: string; siteId: string; school: string; activity: string; programName: string | null }, row: { definitionId: string | null; siteId: string | null; programName: string | null; kind: string | null; moment: string; excluded: boolean; linkedCourseId: string | null; context: ResponseGroupingContext }, allowedInstruments: Set<string>) {
  const issues: string[] = [];
  if (row.siteId !== course.siteId) issues.push("Sitio diferente");
  if (row.programName !== course.programName) issues.push("Programa diferente");
  if (!row.context.school || normalized(row.context.school) !== normalized(course.school)) issues.push("Revisar escuela");
  if (!row.context.activity || normalized(row.context.activity) !== normalized(course.activity)) issues.push("Revisar actividad");
  if (!row.context.date) issues.push("Revisar fecha de agrupación");
  if (!((row.kind === "LEARNING" && ["PRE", "POST"].includes(row.moment)) || row.kind === "CQS" && row.moment === "CQS" || row.kind === "FOLLOW_UP" && row.moment === "POST_POST")) issues.push("Revisar tipo de instrumento o momento");
  if (["CQS", "FOLLOW_UP"].includes(row.kind ?? "") && !allowedInstruments.has(row.definitionId ?? "")) issues.push("Vincular primero el instrumento complementario");
  if (row.excluded) issues.push("Respuesta excluida");
  if (row.linkedCourseId && row.linkedCourseId !== course.id) issues.push("Ya pertenece a otra edición");
  return issues;
}
