import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Modal } from "../shared/components/Modal";
import { migrationResult, migrationProgress } from "../features/surveys/migration-result";

describe("assistant fixes", () => {
  it("reports complete and empty migrations using actual totals", () => {
    for (const total of [0, 5]) expect(migrationResult({ total, updated: total, pending: 0, errors: 0, skipped: 0 })).toEqual({ message: `Se actualizaron ${total} respuestas`, retry: false });
  });
  it("does not count pending, failed or preserved responses as updated", () => {
    const result = migrationResult({ total: 5, updated: 2, pending: 1, errors: 1, skipped: 1 });
    expect(result.message).toContain("Solo se actualizaron 2 de 5 respuestas");
    expect(result.message).toContain("Pendientes de configuración: 1");
    expect(result.retry).toBe(true);
  });
  it("distinguishes saved versioned receipts from a failed download", () => {
    const result = migrationResult({ total: 4, updated: 0, pending: 4, errors: 0, skipped: 0 });
    expect(result.message).toContain("Se guardaron 4 de 4 envíos");
    expect(result.message).not.toContain("No se pudieron migrar");
  });
  it("reports total failure and allows retry", () => {
    const result = migrationResult({ total: 3, updated: 0, pending: 0, errors: 3, skipped: 0 });
    expect(result.message).toContain("No se pudieron migrar las encuestas.");
    expect(result.retry).toBe(true);
  });
  it("limits the assistant dialog to 60rem while retaining responsive width", () => {
    const markup = renderToStaticMarkup(<Modal open onClose={() => {}} width="60rem" title="Asistente">Contenido</Modal>);
    expect(markup).toContain("max-width:60rem");
    expect(markup).toContain("w-full");
    expect(markup).toContain('role="dialog"');
  });
});

it("recovers persisted migration progress and permits retry only after the worker stops", () => {
  const progress = { definitionId: "definition", status: "RUNNING", total: 8, updated: 2, pending: 1, errors: 1, skipped: 1 };
  expect(migrationProgress({ ...progress, phase: "DOWNLOADING" })).toMatchObject({ running: true, retry: false, message: expect.stringContaining("8 recibidas") });
  expect(migrationProgress(progress)).toMatchObject({ running: true, retry: false, message: expect.stringContaining("5 de 8 revisadas") });
  expect(migrationProgress({ ...progress, status: "INTERRUPTED" })).toMatchObject({ running: false, retry: true, message: expect.stringContaining("se interrumpió") });
  expect(migrationProgress({ ...progress, status: "FINISHED" }).message).toContain("Solo se actualizaron 2 de 8");
  expect(migrationProgress({ ...progress, status: "INTERRUPTED", autoAttempts: 5 }).message).toContain("Se agotaron los cinco reintentos");
  expect(migrationProgress({ ...progress, status: "IDLE" }).message).toContain("sin volver a asociarlo");
});
