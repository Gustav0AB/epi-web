// Shared CSV reader; strict mode protects previews from ambiguous input.

export function parseCsvRows(text: string, strict = false): string[][] {
  const s = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"); // normaliza CRLF/CR → LF
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // comilla escapada ""
        else { inQuotes = false; closedQuote = true; }
      } else field += c;
      continue;
    }
    if (strict && closedQuote && c !== "," && c !== "\n") {
      if (c === " " || c === "\t") continue;
      throw new Error(`Invalid CSV after closing quote in row ${rows.length + 1}`);
    }
    if (c === '"') {
      if (strict && field !== "") throw new Error(`Invalid CSV quote in row ${rows.length + 1}`);
      inQuotes = true;
    }
    else if (c === ",") { row.push(field); field = ""; closedQuote = false; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; closedQuote = false; }
    else field += c;
  }
  if (strict && inQuotes) throw new Error("CSV contains an unclosed quote");
  if (field !== "" || row.length > 0 || closedQuote) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Parsea un CSV con encabezados en la primera fila a objetos {columna: valor}.
 * Recorta espacios y descarta filas totalmente vacías.
 */
export function parseCsv(text: string, options: { strict?: boolean; requiredHeaders?: string[] } = {}): Record<string, string>[] {
  const rows = parseCsvRows(text, options.strict ?? false);
  if (rows.length === 0) {
    if (options.requiredHeaders?.length) throw new Error("CSV headers are required");
    return [];
  }
  const headers = rows[0]!.map((h) => h.trim());
  if (options.strict && (headers.some((header) => !header) || new Set(headers).size !== headers.length)) throw new Error("CSV headers must be unique and nonempty");
  if (options.requiredHeaders?.some((header) => !headers.includes(header))) throw new Error(`Required CSV columns: ${options.requiredHeaders.join(", ")}`);
  if (options.strict && rows.slice(1).some((cells) => cells.some((cell) => cell.trim()) && cells.length !== headers.length)) throw new Error("CSV rows must match the header column count");
  return rows
    .slice(1)
    .filter((cells) => cells.some((c) => c.trim() !== ""))
    .map((cells) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim(); });
      return obj;
    });
}

export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
