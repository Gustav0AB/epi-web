import type { PaginationMeta } from "@epi/shared";
import { Button } from "./Button";
import { useI18n } from "../../lib/i18n";

type Props = { meta: PaginationMeta; onPageChange: (page: number) => void; disabled?: boolean };

export function Pagination({ meta, onPageChange, disabled }: Props) {
  const { t } = useI18n();
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600" aria-label={t("pagination.label")}>
      <span aria-live="polite">{from}–{Math.min(meta.page * meta.pageSize, meta.total)} {t("table.of")} {meta.total}</span>
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" disabled={disabled || meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>{t("table.prevPage")}</Button>
        <span>{meta.page} / {Math.max(1, meta.totalPages)}</span>
        <Button variant="secondary" size="sm" disabled={disabled || meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>{t("table.nextPage")}</Button>
      </div>
    </nav>
  );
}
