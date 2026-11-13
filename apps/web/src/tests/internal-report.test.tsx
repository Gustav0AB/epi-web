import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { InternalCourseReportPage } from "../features/reports/InternalCourseReportPage";
it("offers a temporary course query and selection without publishing", () => {
 const html = renderToStaticMarkup(<MemoryRouter><InternalCourseReportPage /></MemoryRouter>);
 expect(html).toContain("Reportes internos"); expect(html).toContain("Buscar cursos");
 expect(html).toContain("Generar reporte"); expect(html).toContain("solo permanecen en esta pantalla");
 expect(html).not.toContain("Publicar");
});
