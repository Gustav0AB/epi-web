import { expect, it } from "vitest";
import { SchoolContextSchema, SubmissionContextReviewSchema } from "@epi/shared";

it("reads earlier contexts without exposing extra source properties", () => {
  const context = SchoolContextSchema.parse({ original: "School", school: "School", extractedDate: null, needsReview: false, secret: "hidden" });
  expect(context.groupingDate).toBeNull();
  expect(context).not.toHaveProperty("secret");
});
it("rejects malformed context and accepts a review flag", () => {
  expect(SchoolContextSchema.safeParse({ school: "School" }).success).toBe(false);
  expect(SchoolContextSchema.safeParse({ original: "Bad date", school: null, extractedDate: "2026-02-30", needsReview: true }).success).toBe(false);
  expect(SchoolContextSchema.parse({ original: "Bad date", school: null, extractedDate: null, needsReview: true }).needsReview).toBe(true);
});

it("requires a school, a calendar date and a revision; permits clearing confirmation", () => {
  expect(SubmissionContextReviewSchema.safeParse({ expectedRevision: 0, context: null }).success).toBe(true);
  for (const context of [{ school: " ", date: "2026-11-04" }, { school: "School", date: "2026-02-30" }]) expect(SubmissionContextReviewSchema.safeParse({ expectedRevision: 0, context }).success).toBe(false);
  expect(SubmissionContextReviewSchema.safeParse({ expectedRevision: -1, context: null }).success).toBe(false);
});

it("validates optional activity while preserving legacy requests", () => {
  const context = { school: "School", date: "2026-11-04" };
  expect(SubmissionContextReviewSchema.parse({ expectedRevision: 0, context }).context).not.toHaveProperty("activity");
  expect(SubmissionContextReviewSchema.parse({ expectedRevision: 0, context: { ...context, activity: "  Trip  " } }).context!.activity).toBe("Trip");
  expect(SubmissionContextReviewSchema.safeParse({ expectedRevision: 0, context: { ...context, activity: "x".repeat(201) } }).success).toBe(false);
});
