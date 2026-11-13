import type { SurveyGroupSearchRow } from "@epi/shared";

export function courseSelectionError(rows: SurveyGroupSearchRow[]): string | null {
  if (rows.length > 1 && rows.some(row => row.courseId)) return "Consulta cada curso confirmado por separado; selecciona solo respuestas individuales para crear un curso.";
  return null;
}

export function coursePage<T>(rows: T[], page: number) {
  const totalPages = Math.ceil(rows.length / 10);
  const currentPage = Math.max(1, Math.min(page, Math.max(1, totalPages)));
  return { currentPage, totalPages, rows: rows.slice((currentPage - 1) * 10, currentPage * 10) };
}
