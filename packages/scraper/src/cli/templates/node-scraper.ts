/**
 * Node.js scraper starter template using @timetiles/scraper SDK.
 *
 * @module
 * @category CLI Templates
 */

export function nodeScraperTemplate(vars: { name: string }): string {
  return `/**
 * ${vars.name} — a TimeTiles scraper.
 *
 * Uses @timetiles/scraper for type-safe CSV output.
 * Install locally for development: npm install @timetiles/scraper
 */
import { output } from "@timetiles/scraper";

// --- Your scraping logic here ---

const rows = [
  { title: "Example Event", date: "2026-01-15", location: "Berlin" },
];

for (const row of rows) {
  output.writeRow(row);
}

output.save();
console.log(\`Wrote \${output.rowCount} rows\`);
`;
}
