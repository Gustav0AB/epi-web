import { describe, expect, it } from "vitest";
import type { SurveyGroupSearchRow } from "@epi/shared";
import { coursePage, courseSelectionError } from "../features/surveys/course-selection";

const individual = {} as SurveyGroupSearchRow;
const course = { courseId: "confirmed" } as SurveyGroupSearchRow;

describe("course selection", () => {
  it("paginates at ten items and clamps the page when filters remove rows", () => {
    const rows = Array.from({ length: 21 }, (_, index) => index);
    expect(coursePage(rows, 1).rows).toEqual(rows.slice(0, 10));
    expect(coursePage(rows, 2).rows).toEqual(rows.slice(10, 20));
    expect(coursePage(rows, 3).rows).toEqual([20]);
    expect(coursePage(rows.slice(0, 2), 3)).toEqual({ currentPage: 1, totalPages: 1, rows: [0, 1] });
    expect(coursePage([], 1)).toEqual({ currentPage: 1, totalPages: 0, rows: [] });
  });
  it("allows any number of individual groups or one confirmed course", () => {
    expect(courseSelectionError([individual, individual, individual])).toBeNull();
    expect(courseSelectionError([course])).toBeNull();
  });
  it("rejects mixed selections and multiple confirmed courses", () => {
    expect(courseSelectionError([course, individual])).toMatch(/por separado/);
    expect(courseSelectionError([course, course])).toMatch(/por separado/);
  });
});
