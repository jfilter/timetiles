/**
 * Type-safe CSV output writer for TimeTiles scrapers.
 *
 * Collects rows in memory and writes them as CSV when `save()` is called.
 * Headers are the union of every row's keys, in first-seen order.
 *
 * @module
 * @category SDK
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Constraint type for row objects — values must be strings or numbers. */
export type OutputRow = Record<string, string | number>;

/**
 * RFC 4180 field escaping: quote when the value contains a delimiter, quote,
 * or any line break (including bare `\r`), doubling embedded quotes. Applied
 * to header cells too — an unescaped comma in a column key shifts every column.
 */
const escapeCsvField = (str: string): string => {
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * CSV output writer with optional generic type parameter for row schema.
 *
 * @example
 * ```ts
 * // Untyped (accepts any row shape)
 * import { output } from '@timetiles/scraper';
 * output.writeRow({ title: "Event", date: "2026-01-01" });
 * output.save();
 *
 * // Typed (enforces row shape)
 * import { OutputWriter } from '@timetiles/scraper';
 * type Event = { title: string; date: string; location: string };
 * const writer = new OutputWriter<Event>();
 * writer.writeRow({ title: "Concert", date: "2026-02-01", location: "Berlin" });
 * writer.save("events.csv");
 * ```
 */
export class OutputWriter<T extends OutputRow = OutputRow> {
  readonly #rows: T[] = [];
  readonly #outputDir: string;
  #filename: string;

  constructor(outputDir?: string, filename?: string) {
    this.#outputDir = outputDir ?? process.env.TIMESCRAPE_OUTPUT_DIR ?? "/output";
    // The runner passes the filename the scraper's manifest declared via
    // `output:`. Without this the SDK always wrote data.csv while the runner
    // looked for the configured name, so every manifest declaring anything
    // else failed its run with "no output file produced".
    this.#filename = filename ?? process.env.TIMESCRAPE_OUTPUT_FILE ?? "data.csv";
  }

  /** Append a single row. */
  writeRow(row: T): void {
    this.#rows.push(row);
  }

  /** Append multiple rows at once. */
  writeRows(rows: T[]): void {
    for (const row of rows) {
      this.writeRow(row);
    }
  }

  /** Number of rows written so far. */
  get rowCount(): number {
    return this.#rows.length;
  }

  /**
   * Column set for the CSV: the union of every row's keys, in first-seen order.
   *
   * Deriving headers from the FIRST row only silently dropped every field that
   * appears solely in later rows — a listing where only some entries carry a
   * `price` lost that column entirely. Mirrors `unparseRowsToCsv` in the web
   * app (`apps/web/lib/utils/csv-escape.ts`), which fixed the same bug there.
   */
  #columns(): string[] {
    const columns: string[] = [];
    const seen = new Set<string>();
    for (const row of this.#rows) {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          columns.push(key);
        }
      }
    }
    return columns;
  }

  /**
   * Write all collected rows to CSV.
   *
   * Writing zero rows is a legitimate result — a listing page with no entries
   * today — and produces an empty file rather than an error. The runner reads
   * "file present, zero records" as a successful run of zero rows; only a
   * MISSING file (the scraper never called `save()`) counts as a failure.
   *
   * @param filename - Override the configured output filename.
   * @returns Absolute path to the written CSV file.
   */
  save(filename?: string): string {
    if (filename) this.#filename = filename;
    const outputPath = join(this.#outputDir, this.#filename);
    writeFileSync(outputPath, this.toCsvString(), "utf-8");
    return outputPath;
  }

  /** Return collected rows as a CSV string (identical to what save() writes). */
  toCsvString(): string {
    const headers = this.#columns();
    if (!headers.length) return "";
    const lines = [headers.map(escapeCsvField).join(",")];
    for (const row of this.#rows) {
      lines.push(headers.map((h) => escapeCsvField(String(row[h] ?? ""))).join(","));
    }
    return lines.join("\n") + "\n";
  }
}

/** Module-level singleton for convenience. */
export const output = new OutputWriter();
