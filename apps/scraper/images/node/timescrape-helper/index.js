/**
 * CSV output helper for TimeScrape Node.js scrapers.
 *
 * Usage:
 *   import { output } from '@timescrape/helper';
 *
 *   output.writeRow({ title: 'Event', date: '2026-01-01', location: 'Berlin' });
 *   output.writeRow({ title: 'Concert', date: '2026-02-01', location: 'Munich' });
 *   output.save();
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

class OutputWriter {
  #rows = [];
  #headers = null;
  #outputDir = process.env.TIMESCRAPE_OUTPUT_DIR ?? "/output";
  #filename = "data.csv";

  /**
   * Append a single row. Headers are auto-detected from the first row.
   * @param {Record<string, string|number>} row
   */
  writeRow(row) {
    if (!this.#headers) {
      this.#headers = Object.keys(row);
    }
    this.#rows.push(row);
  }

  /**
   * Append multiple rows at once.
   * @param {Record<string, string|number>[]} rows
   */
  writeRows(rows) {
    for (const row of rows) {
      this.writeRow(row);
    }
  }

  /** Number of rows written so far. */
  get rowCount() {
    return this.#rows.length;
  }

  /**
   * Write all collected rows to CSV.
   * @param {string} [filename] - Override the default output filename.
   * @returns {string} Absolute path to the written CSV file.
   */
  save(filename) {
    if (filename) this.#filename = filename;
    const outputPath = join(this.#outputDir, this.#filename);

    if (!this.#rows.length) {
      const headerLine = this.#headers ? this.#headers.join(",") + "\n" : "";
      writeFileSync(outputPath, headerLine, "utf-8");
      return outputPath;
    }

    if (!this.#headers) {
      this.#headers = Object.keys(this.#rows[0]);
    }

    const lines = [this.#headers.join(",")];
    for (const row of this.#rows) {
      const values = this.#headers.map((h) => {
        const val = row[h] ?? "";
        const str = String(val);
        // Quote fields that contain commas, quotes, or newlines
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      lines.push(values.join(","));
    }

    writeFileSync(outputPath, lines.join("\n") + "\n", "utf-8");
    return outputPath;
  }

  /**
   * Return collected rows as a CSV string (for debugging).
   * @returns {string}
   */
  toCsvString() {
    if (!this.#rows.length || !this.#headers) return "";
    const lines = [this.#headers.join(",")];
    for (const row of this.#rows) {
      const values = this.#headers.map((h) => String(row[h] ?? ""));
      lines.push(values.join(","));
    }
    return lines.join("\n") + "\n";
  }
}

// Module-level singleton
export const output = new OutputWriter();
