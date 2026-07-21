/**
 * Minimal RFC 4180 CSV helpers for inspecting scraper output.
 *
 * @module
 * @category Lib
 */

/**
 * Count CSV records (including the header) in a CSV document.
 *
 * Splitting on `\n` and counting lines over-counts: a quoted field may contain
 * line breaks, so a single record can span many lines and a scraper reporting
 * "12 rows" could have produced 3. Track quote state instead, so only line
 * breaks OUTSIDE quotes end a record.
 *
 * Blank records are skipped, which covers the trailing newline every writer
 * emits as well as stray blank lines mid-file.
 */
export const countCsvRecords = (text: string): number => {
  let count = 0;
  let inQuotes = false;
  let current = "";

  const endRecord = (): void => {
    if (current.trim().length > 0) count++;
    current = "";
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote is an escaped quote, not the end of the field.
        if (text[i + 1] === '"') {
          current += '""';
          i++;
        } else {
          inQuotes = false;
          current += char;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      current += char;
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      continue;
    }

    current += char;
  }

  endRecord();
  return count;
};

/**
 * Count DATA rows: every record after the header. A header-only or empty
 * document yields 0 rather than a negative count.
 */
export const countCsvDataRows = (text: string): number => Math.max(0, countCsvRecords(text) - 1);
