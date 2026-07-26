// ponytail: parser CSV mínimo (comillas, comas embebidas, CRLF). Cambiar a
// papaparse solo si aparecen CSVs con formatos raros. Self-check en csv.selfcheck.ts.

function parseRows(text: string): string[][] {
  const s = text.replace(/\r\n?/g, "\n"); // normaliza CRLF/CR → LF
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // comilla escapada ""
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Parsea un CSV con encabezados en la primera fila a objetos {columna: valor}.
 * Recorta espacios y descarta filas totalmente vacías.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((h) => h.trim());
  return rows
    .slice(1)
    .filter((cells) => cells.some((c) => c.trim() !== ""))
    .map((cells) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim(); });
      return obj;
    });
}
