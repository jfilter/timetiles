/**
 * Python scraper starter template.
 *
 * @module
 * @category CLI Templates
 */

export function pythonScraperTemplate(vars: { name: string }): string {
  return `"""
${vars.name} — a TimeTiles scraper.

Uses the timetiles scraper SDK for CSV output.
Install locally for development: pip install timetiles
"""
from timetiles.scraper import output

# --- Your scraping logic here ---

rows = [
    {"title": "Example Event", "date": "2026-01-15", "location": "Berlin"},
]

for row in rows:
    output.write_row(row)

output.save()
print(f"Wrote {output.row_count} rows")
`;
}
