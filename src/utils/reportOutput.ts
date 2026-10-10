/**
 * CSV helpers shared by the reports that export a table.
 *
 * Printing goes through the report's own PDF (utils/printPdf), so what is
 * printed is always the document the PDF button downloads.
 */

/** One CSV cell, quoted when it needs to be. */
export const csvCell = (value: string | number | undefined | null): string => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Rows to CSV text. */
export const toCsv = (rows: ReadonlyArray<ReadonlyArray<string | number | undefined | null>>): string =>
  rows.map((row) => row.map(csvCell).join(',')).join('\n');
