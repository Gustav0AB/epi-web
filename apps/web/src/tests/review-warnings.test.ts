import { describe, expect, it } from "vitest";
import type { CourseSubmissionDto } from "@epi/shared";
import { courseReviewWarnings, submittedDay } from "../features/surveys/review-warnings";

type Row = Pick<CourseSubmissionDto, "id" | "participantId" | "surveyMoment" | "submittedAt" | "reviewExcluded" | "isDuplicate">;
const row = (id: string, participantId: string | null, surveyMoment: "PRE" | "POST", receivedAt: string, extra: Partial<Row> = {}): Row => ({ id, participantId, surveyMoment, submittedAt: receivedAt, reviewExcluded: false, isDuplicate: false, ...extra });
const early = "2026-01-01T12:00:00.000Z", later = "2026-01-02T12:00:00.000Z";

describe("avisos de revisión de respuestas", () => {
  it("usa la fecha original sin inventar una fecha para valores inválidos", () => {
    expect(submittedDay("2026-03-04 15:20:00")).toBe("2026-03-04");
    expect(submittedDay("2026-02-30 15:20:00")).toBeNull();
    expect(submittedDay(null)).toBeNull();
  });
  it("marca ambos envíos del mismo participante y momento, sin agrupar por fecha o nombre", () => {
    const warnings = courseReviewWarnings([row("a", "p1", "PRE", early), row("b", "p1", "PRE", later), row("c", "p2", "PRE", early), row("d", null, "PRE", early), row("e", null, "PRE", early)]);
    expect([...warnings.keys()].sort()).toEqual(["a", "b"]);
    expect(warnings.get("a")?.[0]).toContain("Pre duplicado");
  });
  it("avisa del posible orden invertido y se actualiza al corregir el momento", () => {
    const original = [row("a", "p1", "PRE", later), row("b", "p1", "POST", early)];
    expect(courseReviewWarnings(original).get("a")?.some(message => message.includes("orden invertido"))).toBe(true);
    const fixed = [row("a", "p1", "POST", later), row("b", "p1", "PRE", early)];
    expect(courseReviewWarnings(fixed).size).toBe(0);
  });
  it("marca fechas fuera de orden incluso sin identidad y no considera la misma fecha un error", () => {
    const warnings = courseReviewWarnings([row("a", null, "PRE", early), row("b", null, "POST", early), row("c", null, "PRE", later), row("d", null, "POST", "2025-12-31T12:00:00Z")]);
    expect(warnings.get("c")?.[0]).toContain("último Post");
    expect(warnings.get("d")?.[0]).toContain("primer Pre");
    expect(warnings.has("a")).toBe(false);
    expect(warnings.has("b")).toBe(false);
  });
  it("respeta exclusiones, fechas inválidas e indicadores existentes", () => {
    const warnings = courseReviewWarnings([row("a", "p1", "PRE", later), row("b", "p1", "PRE", early, { reviewExcluded: true }), row("c", "p1", "POST", "inválida"), row("d", null, "PRE", early, { isDuplicate: true })]);
    expect([...warnings.keys()]).toEqual(["d"]);
    expect(warnings.get("d")?.[0]).toContain("duplicado detectado");
  });
});
