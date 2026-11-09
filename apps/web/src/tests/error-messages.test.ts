import { afterEach, describe, expect, it } from "vitest";
import { ApiError, errorMessage, setErrorLanguage } from "../lib/error-messages";
afterEach(() => setErrorLanguage("es"));
describe("friendly errors", () => {
  it("uses Spanish by default and explicit English", () => {
    expect(errorMessage("INVALID_CREDENTIALS")).toContain("usuario o la contraseña");
    setErrorLanguage("en");
    expect(errorMessage("INVALID_CREDENTIALS")).toContain("username or password");
    expect(errorMessage("INVALID_CREDENTIALS", undefined, "es")).toContain("usuario");
  });
  it("keeps actionable Spanish domain validation and hides technical details", () => {
    expect(new ApiError("BAD_REQUEST", "Selecciona al menos una categoría").message).toBe("Selecciona al menos una categoría");
    for (const code of ["UNKNOWN", "INTERNAL_ERROR", "BAD_REQUEST"]) {
      expect(errorMessage(code, "Prisma: no existe la tabla password")).not.toContain("Prisma");
    }
    expect(errorMessage("ACCOUNT_LOCKED")).toContain("15 minutos");
    expect(errorMessage("ACCOUNT_INACTIVE")).toContain("desactivada");
  });
});
