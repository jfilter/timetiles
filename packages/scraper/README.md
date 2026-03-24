# @timetiles/scraper

SDK for building [TimeTiles](https://docs.timetiles.io) scrapers — type-safe CSV output and project scaffolding.

## Quick Start

```bash
# Scaffold a new scraper project
npx @timetiles/scraper init my-scraper
npx @timetiles/scraper init my-scraper --runtime node
```

## Usage

```js
import { output } from "@timetiles/scraper";

// Fetch your data (using axios, cheerio, fetch, etc.)
const events = await fetchEvents();

// Write rows
for (const event of events) {
  output.writeRow({ title: event.name, date: event.date, location: event.venue });
}

// Save as CSV
output.save();
console.log(`Wrote ${output.rowCount} events`);
```

## TypeScript Support

Use generics for type-safe row schemas:

```ts
import { OutputWriter } from "@timetiles/scraper";

interface Event {
  title: string;
  date: string;
  location: string;
  url: string;
}

const writer = new OutputWriter<Event>();
writer.writeRow({ title: "Concert", date: "2026-02-01", location: "Berlin", url: "..." });
writer.save("events.csv");
```

## API

### `output` (singleton)

- `output.writeRow(row)` — Append a row (headers auto-detected from first row)
- `output.writeRows(rows)` — Append multiple rows
- `output.save(filename?)` — Write CSV to disk (default: `data.csv`)
- `output.rowCount` — Number of rows written
- `output.toCsvString()` — Get CSV as string (for debugging)

### `OutputWriter<T>` (class)

Create custom instances with typed schemas:

```ts
const writer = new OutputWriter<MySchema>(outputDir);
```

## Environment

- `TIMESCRAPE_OUTPUT_DIR` — Output directory (default: `/output`, set automatically in TimeTiles containers)

## License

AGPL-3.0-or-later
