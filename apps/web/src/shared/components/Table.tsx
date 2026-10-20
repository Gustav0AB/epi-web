import { Table as UiTable } from "@epi/ui";
import type { Column as UiColumn, TableProps as UiTableProps } from "@epi/ui";
import { useI18n } from "../../lib/i18n";

export type Column<T> = UiColumn<T>;
type Props<T> = Omit<UiTableProps<T>, "labels">;

export function Table<T extends Record<string, unknown>>(props: Props<T>) {
  const { t } = useI18n();
  return (
    <UiTable
      {...props}
      labels={{
        loading: t("table.loading"),
        noData: t("table.noData"),
        rowsPerPage: t("table.rowsPerPage"),
        of: t("table.of"),
        prevPage: t("table.prevPage"),
        nextPage: t("table.nextPage"),
      }}
    />
  );
}
