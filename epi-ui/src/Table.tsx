import { useState, useEffect } from "react";
import { Pagination } from "./Pagination.js";
import { useI18n } from "./i18n.js";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: "left" | "center" | "right";
};

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

      {paginated && !loading && rows.length > 0 && <Pagination meta={{ page: page + 1, pageSize: size, total: rows.length, totalPages }} onPageChange={next => setPage(next - 1)} onPageSizeChange={setSize} />}
    </div>
  );
}
