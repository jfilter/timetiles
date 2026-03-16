/**
 * Python scraper starter template.
 *
 * @module
 * @category CLI Templates
 */

export function pythonScraperTemplate(vars: { name: string }): string {
  return `"""
${vars.name} — a TimeScrape scraper.

Writes CSV output to /output/data.csv inside the container.
The TIMESCRAPE_OUTPUT_DIR environment variable points to the output directory.
"""
import csv
import os

output_dir = os.environ.get("TIMESCRAPE_OUTPUT_DIR", "/output")
output_path = os.path.join(output_dir, "data.csv")

# --- Your scraping logic here ---

rows = [
    {"title": "Example Event", "date": "2026-01-15", "location": "Berlin"},
]

# --- Write output CSV ---

with open(output_path, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["title", "date", "location"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} rows to {output_path}")
`;
}
