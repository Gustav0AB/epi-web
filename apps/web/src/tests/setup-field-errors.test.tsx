import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dropdown, TextField } from "@epi/ui";
import { SetupAnalysisScoring } from "../features/surveys/SetupAnalysisScoring";

describe("avisos accesibles de configuración", () => {
  it("enlaza el error de cada campo con el control", () => {
    const html = renderToStaticMarkup(<><TextField id="name" label="Nombre" error="Es requerido" /><Dropdown id="choice" label="Opción" options={[]} error="Selecciona una opción" /></>);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="name-message"');
    expect(html).toContain('id="name-message"');
    expect(html).toContain('aria-describedby="choice-message"');
    expect(html).toContain('id="choice-message"');
  });
  it("identifica el máximo y la respuesta sin configurar", () => {
    const question = { externalId: "q", text: "Pregunta completa", type: "ONE_ANSWER" as const, role: "SCORED" as const, classification: { category: "Cat", subcategory: "Sub" }, options: ["A", "B"], analysisParticipation: [{ analysisType: "pre_post" as const, enabled: true }, { analysisType: "pre_post_post" as const, enabled: false }] };
    const html = renderToStaticMarkup(<SetupAnalysisScoring view="questions" questions={[question]} onChange={() => {}} />);
    expect(html).toContain("Indica el máximo.");
    expect(html).toContain("Selecciona la respuesta correcta.");
    expect((html.match(/aria-invalid="true"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
