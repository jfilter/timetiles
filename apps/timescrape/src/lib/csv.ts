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
 * breaks OUTSIDE quotes end a record. As in Python's csv module, a quote opens
 * a quoted field only at the start of a field; elsewhere it is a literal.
 *
 * A record holding one empty field, blank or a quoted "", is skipped as the
 * import's Papa Parse `skipEmptyLines` drops it. A line holding only
 * whitespace is a record with one field, as Papa Parse reads it.
 */
export const countCsvRecords = (text: string): number => {
  let count = 0;
  let fieldStart = true;
  let emptyRecord = true;
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;

    if (char === "\n" || char === "\r") {
      if (!emptyRecord) count++;
      emptyRecord = true;
      fieldStart = true;
      i += char === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }

    if (char === '"' && fieldStart) {
      const closing = closingQuoteIndex(text, i + 1);
      if (closing > i + 1) emptyRecord = false;
      i = closing;
    } else {
      emptyRecord = false;
    }
    fieldStart = char === ",";
    i++;
  }

  if (!emptyRecord) count++;
  return count;
};

/** Index of the quote closing a quoted field that starts at `from`; a doubled quote is an escaped one. */
const closingQuoteIndex = (text: string, from: number): number => {
  let i = text.indexOf('"', from);
  while (i !== -1 && text[i + 1] === '"') i = text.indexOf('"', i + 2);
  return i === -1 ? text.length : i;
};

/**
 * Count DATA rows: every record after the header. A header-only or empty
 * document yields 0 rather than a negative count.
 */
export const countCsvDataRows = (text: string): number => Math.max(0, countCsvRecords(text) - 1);
