import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../pages/HomePage";

it("shows the four requested dashboard indicators without participant information", () => {
 const html = renderToStaticMarkup(<MemoryRouter><HomePage /></MemoryRouter>);
 for (const label of ["Cursos revisados", "Pendientes de revisión", "Respuestas recibidas", "Reportes publicados", "Actividad reciente"]) expect(html).toContain(label);
 expect(html).not.toContain("Nombre del participante");
});
