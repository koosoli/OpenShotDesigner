/**
 * CSV rows from text: quoted fields, doubled quotes, CRLF, and the delimiter
 * spreadsheets actually use — a comma, or a semicolon where the comma is the
 * decimal separator (German and most European Excel exports), or a tab.
 * Blank rows are dropped.
 */

export type CsvDelimiter = ',' | ';' | '\t';

/** The delimiter of the first non-empty line, counted outside quotes. */
export const detectCsvDelimiter = (text: string): CsvDelimiter => {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === ',' || ch === ';' || ch === '\t')) counts[ch] += 1;
  }
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return counts[';'] > counts[','] ? ';' : ',';
};

export const parseCsvRows = (text: string, delimiter: CsvDelimiter = detectCsvDelimiter(text)): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
};
