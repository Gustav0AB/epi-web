import { createHash } from "node:crypto";
import { ActivityContextSchema, SchoolContextSchema, type ResponseGroupingContext } from "@epi/shared";
import { originalSubmissionDay, schoolContext } from "./school-context.js";

export function configuredDemographics(answers: { questionId: string; value: unknown }[], questions: { externalId: string; role?: string }[]) {
  function value(role: string) {
    const fields = questions.filter(question => question.role === role);
    if (!fields.length) return { configured: false, original: null };
    const matches = answers.filter(answer => answer.questionId === fields[0]!.externalId);
    return { configured: true, original: fields.length === 1 && matches.length === 1 ? matches[0]!.value : null };
  }
  const gender = value("GENDER"); const age = value("AGE");
  const genderValue = typeof gender.original === "string" && gender.original.trim() ? gender.original.trim().replace(/\s+/g, " ") : null;
  const ageValue = typeof age.original === "number" || typeof age.original === "string" && /^\d+$/.test(age.original.trim()) ? Number(age.original) : NaN;
  const validAge = Number.isSafeInteger(ageValue) && ageValue >= 0 && ageValue <= 2147483647 ? ageValue : null;
  return { gender: { ...gender, value: genderValue, needsReview: gender.configured && genderValue === null }, age: { ...age, value: validAge, needsReview: age.configured && validAge === null } };
}

type ContextRow = { reviewSchool: string | null; reviewDate: string | null; reviewActivity: string | null; reviewGender: string | null; reviewAge: number | null; rawJsonData: unknown; surveyDefinition: { activityName: string | null } | null };
export function responseGroupingContext(row: ContextRow): ResponseGroupingContext {
  const raw = row.rawJsonData != null && typeof row.rawJsonData === "object" && !Array.isArray(row.rawJsonData) ? row.rawJsonData as Record<string, unknown> : {};
  const school = SchoolContextSchema.safeParse(raw.schoolContext);
  const legacyParticipant = raw.participant != null && typeof raw.participant === "object" ? raw.participant as Record<string, unknown> : {};
  const legacySchool = schoolContext(legacyParticipant.school);
  const activity = ActivityContextSchema.safeParse(raw.activityContext);
  const demographics = raw.demographicContext != null && typeof raw.demographicContext === "object" ? raw.demographicContext as Record<string, { original?: unknown; value?: unknown; configured?: boolean }> : {};
  const detectedSchool = school.success ? school.data.school : legacySchool?.school ?? null;
  const detectedDate = school.success ? school.data.groupingDate ?? school.data.extractedDate : legacySchool?.extractedDate ?? null;
  const gender = row.reviewGender ?? (demographics.gender?.configured ? typeof demographics.gender.value === "string" ? demographics.gender.value : null : typeof legacyParticipant.gender === "string" ? legacyParticipant.gender : null);
  const sourceAge = demographics.age?.configured ? demographics.age.value : legacyParticipant.age;
  const age = row.reviewAge ?? (typeof sourceAge === "number" && Number.isSafeInteger(sourceAge) && sourceAge >= 0 ? sourceAge : null);
  const normalized = (value: string | null) => value?.trim().replace(/\s+/g, " ") || null;
  const context = {
    school: normalized(row.reviewSchool ?? detectedSchool), date: row.reviewDate ?? detectedDate ?? originalSubmissionDay(raw.created_at),
    activity: normalized(row.reviewActivity ?? (activity.success ? activity.data.activity : row.surveyDefinition?.activityName ?? null)),
    dateSource: row.reviewDate ? "manual" as const : (school.success ? school.data.dateSource ?? (school.data.extractedDate ? "school_field" as const : null) : legacySchool?.extractedDate ? "school_field" as const : null) ?? (originalSubmissionDay(raw.created_at) ? "submitted_at" as const : null),
    originalSchool: school.success ? school.data.original : legacySchool?.original ?? null,
    submittedAt: school.success ? school.data.originalSubmittedAt ?? (typeof raw.created_at === "string" ? raw.created_at : null) : typeof raw.created_at === "string" ? raw.created_at : null,
    gender, age, originalGender: demographics.gender?.original ?? legacyParticipant.gender ?? null, originalAge: demographics.age?.original ?? legacyParticipant.age ?? null,
  };
  return { ...context, needsReview: !context.school || !context.date || !context.activity };
}

export function responseFingerprint(definitionId: string, answers: { questionId: string; value: unknown }[]) {
  if (!answers.length) return null;
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
  }
  return createHash("sha256").update(JSON.stringify([definitionId, [...answers].sort((a, b) => a.questionId.localeCompare(b.questionId)).map(answer => [answer.questionId, canonical(answer.value)])])).digest("hex");
}
