/**
 * Node.js scraper starter template.
 *
 * @module
 * @category CLI Templates
 */

export function nodeScraperTemplate(vars: { name: string }): string {
  return `/**
 * ${vars.name} — a TimeScrape scraper.
 *
 * Writes CSV output to /output/data.csv inside the container.
 * The TIMESCRAPE_OUTPUT_DIR environment variable points to the output directory.
 */
const fs = require("fs");
const path = require("path");

const outputDir = process.env.TIMESCRAPE_OUTPUT_DIR || "/output";
const outputPath = path.join(outputDir, "data.csv");

// --- Your scraping logic here ---

const rows = [
  { title: "Example Event", date: "2026-01-15", location: "Berlin" },
];

// --- Write output CSV ---

const headers = Object.keys(rows[0]);
const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((h) => row[h]).join(",")),
].join("\\n");

fs.writeFileSync(outputPath, csv + "\\n");
console.log(\`Wrote \${rows.length} rows to \${outputPath}\`);
`;
}
