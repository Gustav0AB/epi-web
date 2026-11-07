import type { AssistantMigrationProgress } from "@epi/shared";

export function migrationResult(result: { total: number; updated: number; pending: number; errors: number; skipped: number }) {
  const complete = result.updated === result.total;
  const message = complete ? `Se actualizaron ${result.updated} respuestas` : result.updated > 0 ? `Solo se actualizaron ${result.updated} de ${result.total} respuestas` : result.pending > 0 ? `Se guardaron ${result.pending} de ${result.total} envíos para revisión. Consulta Cursos para ver las ediciones agrupadas.` : result.skipped > 0 ? "No hubo envíos nuevos para actualizar." : "No se pudieron migrar las encuestas.";
  const detail = complete ? "" : ` Pendientes de configuración: ${result.pending}. Omitidas para conservar respuestas completadas o de otro instrumento: ${result.skipped}. Errores: ${result.errors}.`;
  return { message: message + detail, retry: !complete };
}

export function migrationProgress(progress: AssistantMigrationProgress) {
  const running = progress.status === "RUNNING";
  const message = running && progress.phase === "DOWNLOADING"
    ? `Se están descargando las respuestas… ${progress.total} recibidas.`
    : running
    ? `Se están actualizando las encuestas… ${progress.updated + progress.pending + progress.errors + progress.skipped} de ${progress.total} revisadas.`
    : progress.status === "FINISHED" ? migrationResult(progress).message
    : progress.status === "INTERRUPTED" ? `La migración se interrumpió. Puedes retomarla conservando las respuestas ya actualizadas.${(progress.autoAttempts ?? 0) >= 5 ? " Se agotaron los cinco reintentos automáticos; reintenta manualmente cuando se haya corregido el problema." : ""}`
    : "Puedes migrar las respuestas de este instrumento sin volver a asociarlo.";
  return { definitionId: progress.definitionId, running, retry: !running, message };
}
