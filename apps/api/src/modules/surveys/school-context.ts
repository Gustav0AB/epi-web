import { z } from "zod";

// Dates in Escuela/Grupo use the documented DD/MM/YYYY prefix, never locale guessing.
export function schoolContext(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const original = value;
  const text = value.trim();
  const dated = /^(\d{2})\/(\d{2})\/(\d{4})\s*[-–—]\s*(.*)$/.exec(text);
  if (dated) {
    const [, day, month, year, name] = dated;
    const date = `${year}-${month}-${day}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    const valid = Number(year) >= 1000 && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    if (valid && name!.trim()) return { original, school: name!.trim().replace(/\s+/g, " "), extractedDate: date, needsReview: false };
    return { original, school: null, extractedDate: null, needsReview: true };
  }
  // shortcut: only the agreed date-prefix format is parsed; other date-like text requires review.
  if (/\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}/.test(text)) {
    return { original, school: null, extractedDate: null, needsReview: true };
  }
  return { original, school: text.replace(/\s+/g, " "), extractedDate: null, needsReview: false };
}

export function configuredSchoolContext(
  answers: { questionId: string; value: unknown }[],
  questions: { externalId: string; role?: string }[],
) {
  const fields = questions.filter(question => question.role === "SCHOOL_GROUP");
  if (!fields.length) return undefined;
  const matches = answers.filter(answer => answer.questionId === fields[0]!.externalId);
  const review = { original: null, school: null, extractedDate: null, needsReview: true };
  if (fields.length !== 1 || matches.length !== 1) return review;
  const value = matches[0]!.value;
  const other = value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && "other" in value ? value.other : value;
  return schoolContext(other) ?? review;
}

export function originalSubmissionDay(value: unknown) {
  const day = typeof value === "string" ? /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(value)?.[1] : undefined;
  return z.string().date().safeParse(day).data ?? null;
}

export function schoolGroupingContext(context: NonNullable<ReturnType<typeof schoolContext>> | { original: null; school: null; extractedDate: null; needsReview: boolean }, submittedAt: unknown, timeZone: string | null) {
  const originalSubmittedAt = typeof submittedAt === "string" ? submittedAt : null;
  let groupingDate: string | null = context.extractedDate;
  let dateSource: "school_field" | "submitted_at" | null = groupingDate ? "school_field" : null;
  if (!context.needsReview && !groupingDate && originalSubmittedAt && timeZone) {
    // A timestamp without an offset does not establish an instant; never use the server timezone.
    if (z.string().datetime({ offset: true }).safeParse(originalSubmittedAt).success) {
      try {
        const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(originalSubmittedAt));
        const part = (type: string) => parts.find(item => item.type === type)!.value;
        groupingDate = `${part("year")}-${part("month")}-${part("day")}`;
        dateSource = "submitted_at";
      } catch { /* Invalid legacy zone stays pending for review. */ }
    }
  }
  if (!context.needsReview && !groupingDate && !timeZone) {
    groupingDate = originalSubmissionDay(originalSubmittedAt);
    if (groupingDate) dateSource = "submitted_at";
  }
  return { ...context, originalSubmittedAt, groupingDate, dateSource, timeZone, needsReview: context.needsReview || !groupingDate };
}
