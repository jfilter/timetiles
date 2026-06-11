/**
 * Type-safe CSV output writer for TimeTiles scrapers.
 *
 * Collects rows in memory and writes them as CSV when `save()` is called.
 * Headers are auto-detected from the first row's keys.
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
  #headers: string[] | null = null;
  readonly #outputDir: string;
  #filename = "data.csv";

  constructor(outputDir?: string) {
    this.#outputDir = outputDir ?? process.env.TIMESCRAPE_OUTPUT_DIR ?? "/output";
  }

  /** Append a single row. Headers are auto-detected from the first row. */
  writeRow(row: T): void {
    if (!this.#headers) {
      this.#headers = Object.keys(row);
    }
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
   * Write all collected rows to CSV.
   * @param filename - Override the default output filename ("data.csv").
   * @returns Absolute path to the written CSV file.
   */
  save(filename?: string): string {
    if (filename) this.#filename = filename;
    const outputPath = join(this.#outputDir, this.#filename);

    if (!this.#rows.length) {
      const headerLine = this.#headers ? this.#headers.map(escapeCsvField).join(",") + "\n" : "";
      writeFileSync(outputPath, headerLine, "utf-8");
      return outputPath;
    }

    writeFileSync(outputPath, this.toCsvString(), "utf-8");
    return outputPath;
  }

  /** Return collected rows as a CSV string (identical to what save() writes). */
  toCsvString(): string {
    if (!this.#rows.length) return "";
    if (!this.#headers) {
      this.#headers = Object.keys(this.#rows[0]!);
    }
    const headers = this.#headers;
    const lines = [headers.map(escapeCsvField).join(",")];
    for (const row of this.#rows) {
      lines.push(headers.map((h) => escapeCsvField(String(row[h] ?? ""))).join(","));
    }
    return lines.join("\n") + "\n";
  }
}

/** Module-level singleton for convenience. */
export const output = new OutputWriter();
