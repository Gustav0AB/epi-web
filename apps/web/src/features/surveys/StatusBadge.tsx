import type { SubmissionStatus } from "@epi/shared";
import { Badge } from "../../shared/components";
import { useI18n, type I18nKey } from "../../lib/i18n";

const MAP: Record<SubmissionStatus, { key: I18nKey; color: "green" | "yellow" | "red" }> = {
  PROCESADO: { key: "surveys.status.processed", color: "green" },
  PENDIENTE_CONFIGURACION: { key: "surveys.status.pending", color: "yellow" },
  COMPLETADO: { key: "surveys.status.completed", color: "green" },
  ERROR: { key: "surveys.status.error", color: "red" },
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const { t } = useI18n();
  const { key, color } = MAP[status] ?? { key: undefined, color: "gray" as const };
  return <Badge color={color}>{key ? t(key) : status}</Badge>;
}
