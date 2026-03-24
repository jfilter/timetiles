# timetiles

Python SDK for building [TimeTiles](https://docs.timetiles.io) scrapers — CSV output helper.

Currently provides `timetiles.scraper` for building web scrapers. The `timetiles` namespace is extensible for future sub-packages.

## Install

```bash
pip install timetiles
```

## Usage

```python
from timetiles.scraper import output

# Fetch your data
events = fetch_events()

# Write rows
for event in events:
    output.write_row({
        "title": event["name"],
        "date": event["date"],
        "location": event["venue"],
    })

# Save as CSV
output.save()
print(f"Wrote {output.row_count} events")
```

## API

### `output` (singleton)

- `output.write_row(row)` — Append a dict as a CSV row (headers auto-detected from first row)
- `output.write_rows(rows)` — Append multiple rows
- `output.save(filename=None)` — Write CSV to disk (default: `data.csv`)
- `output.row_count` — Number of rows written
- `output.to_csv_string()` — Get CSV as string (for debugging)

### `OutputWriter` (class)

Create custom instances:

```python
from timetiles.scraper import OutputWriter

writer = OutputWriter(output_dir="./output")
writer.write_row({"title": "Event", "date": "2026-01-01"})
writer.save("events.csv")
```

## Environment

- `TIMESCRAPE_OUTPUT_DIR` — Output directory (default: `/output`, set automatically in TimeTiles containers)

## License

AGPL-3.0-or-later
