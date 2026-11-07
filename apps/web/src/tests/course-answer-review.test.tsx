import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseAnswerReview } from "../features/surveys/CourseAnswerReview";

const submissions = [
  { id: "private-submission-a", reviewExcluded: false, answers: [
    { questionId: "zero", text: "Cantidad indicada", value: "0" },
    { questionId: "blank", text: "¿Qué aprendiste?", value: " " },
    { questionId: "answer", text: "¿Qué actividad realizaste?", value: "Taller" },
  ] },
  { id: "private-submission-b", reviewExcluded: true, answers: [
    { questionId: "excluded", text: "Pregunta de envío excluido", value: "" },
  ] },
];

describe("course submission answer inspection", () => {
  it("shows the question and its answer for the selected submission without exposing its technical identifier", () => {
    const html = renderToStaticMarkup(<CourseAnswerReview submissions={submissions} submissionId="private-submission-a" />);
    expect(html).toContain("¿Qué actividad realizaste?");
    expect(html).toContain("Taller");
    expect(html).toContain("Cantidad indicada");
    expect(html).toContain(">0<");
    expect(html).toContain("Sin contestar");
    expect(html).not.toContain("private-submission-a");
    expect(html).not.toContain("Pregunta de envío excluido");
  });
  it("lists only stored blanks from included submissions and keeps valid zeros out of that list", () => {
    const html = renderToStaticMarkup(<CourseAnswerReview submissions={submissions} onlyBlanks />);
    expect(html).toContain("¿Qué aprendiste?");
    expect(html).not.toContain("Cantidad indicada");
    expect(html).not.toContain("¿Qué actividad realizaste?");
    expect(html).not.toContain("Pregunta de envío excluido");
  });
  it("allows inspecting an excluded submission while identifying its exclusion", () => {
    const html = renderToStaticMarkup(<CourseAnswerReview submissions={submissions} submissionId="private-submission-b" />);
    expect(html).toContain("Envío 2");
    expect(html).toContain("Excluido");
    expect(html).toContain("Pregunta de envío excluido");
  });
});
