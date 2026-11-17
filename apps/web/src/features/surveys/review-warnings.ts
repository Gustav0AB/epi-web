import type { CourseSubmissionDto } from "@epi/shared";

type ReviewRow = Pick<CourseSubmissionDto, "id" | "participantId" | "surveyMoment" | "submittedAt" | "reviewExcluded" | "isDuplicate">;

export function submittedDay(value: string | null | undefined): string | null {
  const day = typeof value === "string" ? /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(value)?.[1] : undefined;
  if (!day) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

export function courseReviewWarnings(rows: ReviewRow[]): Map<string, string[]> {
  const warnings = new Map<string, string[]>();
  const participants = new Map<string, ReviewRow[]>();
  const add = (id: string, message: string) => warnings.set(id, [...(warnings.get(id) ?? []), message]);
  for (const row of rows) {
    if (row.reviewExcluded) continue;
    if (row.isDuplicate) add(row.id, "Posible duplicado detectado; revisar.");
    if (!row.participantId || !["PRE", "POST"].includes(row.surveyMoment)) continue;
    participants.set(row.participantId, [...(participants.get(row.participantId) ?? []), row]);
  }
  const dated = rows.filter(row => !row.reviewExcluded && (row.surveyMoment === "PRE" || row.surveyMoment === "POST")).flatMap(row => { const day = submittedDay(row.submittedAt); return day ? [{ row, day }] : []; });
  const preDates = dated.filter(item => item.row.surveyMoment === "PRE").map(item => item.day);
  const postDates = dated.filter(item => item.row.surveyMoment === "POST").map(item => item.day);
  if (preDates.length && postDates.length) {
    const firstPre = preDates.reduce((first, day) => day < first ? day : first);
    const lastPost = postDates.reduce((last, day) => day > last ? day : last);
    for (const { row, day } of dated) {
      if (row.surveyMoment === "PRE" && day > lastPost) add(row.id, "Pre enviado después del último Post: revisar momento o envío tardío.");
      if (row.surveyMoment === "POST" && day < firstPre) add(row.id, "Post enviado antes del primer Pre: revisar momento o envío tardío.");
    }
  }
  for (const entries of participants.values()) {
    const pre = entries.filter(row => row.surveyMoment === "PRE");
    const post = entries.filter(row => row.surveyMoment === "POST");
    for (const group of [pre, post]) {
      if (group.length > 1) group.forEach(row => add(row.id, `Posible ${row.surveyMoment === "PRE" ? "Pre" : "Post"} duplicado para el mismo participante.`));
    }
    const preDays = pre.map(row => submittedDay(row.submittedAt));
    const postDays = post.map(row => submittedDay(row.submittedAt));
    if (pre.length && post.length && preDays.every(Boolean) && postDays.every(Boolean) && preDays.reduce<string>((earliest, day) => day! < earliest ? day! : earliest, "9999-12-31") > postDays.reduce<string>((latest, day) => day! > latest ? day! : latest, "0000-01-01")) {
      [...pre, ...post].forEach(row => add(row.id, "Posible orden invertido: el envío Pre es posterior al Post."));
    }
  }
  return warnings;
}
