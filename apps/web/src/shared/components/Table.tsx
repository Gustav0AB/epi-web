import { useState, useEffect } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useI18n } from "../../lib/i18n";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: "left" | "center" | "right";
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T, index: number) => string;
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
};

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export function Table<T extends Record<string, unknown>>({
  columns,
  rows,
  keyExtractor,
  loading = false,
  emptyText,
  pageSize: initialPageSize,
}: TableProps<T>) {
  const { t } = useI18n();
  const paginated = initialPageSize !== undefined;
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialPageSize ?? 25);

  useEffect(() => { setPage(0); }, [rows, size]);

  const totalPages = Math.ceil(rows.length / size);
  const displayRows = paginated ? rows.slice(page * size, (page + 1) * size) : rows;
  const from = rows.length === 0 ? 0 : page * size + 1;
  const to = Math.min((page + 1) * size, rows.length);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    "px-4 py-3 font-medium text-gray-600",
                    alignClass[col.align ?? "left"],
                  ].join(" ")}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-gray-400">
                  {t("table.loading")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-gray-400">
                  {emptyText ?? t("table.noData")}
                </td>
              </tr>
            ) : (
              displayRows.map((row, index) => (
                <tr key={keyExtractor(row, index)} className="transition-colors hover:bg-gray-50">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={["px-4 py-3 text-gray-700", alignClass[col.align ?? "left"]].join(" ")}
                    >
                      {col.render ? col.render(row, index) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {paginated && !loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <span>{t("table.rowsPerPage")}</span>
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span>{from}–{to} {t("table.of")} {rows.length}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded p-1 transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t("table.prevPage")}
              >
                <ChevronLeftIcon style={{ fontSize: 18 }} />
              </button>
              <span className="min-w-[4rem] text-center">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded p-1 transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t("table.nextPage")}
              >
                <ChevronRightIcon style={{ fontSize: 18 }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
