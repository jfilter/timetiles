# ADR 0028: JSON API Import with Pagination

## Status

Accepted

## Context

TimeTiles imports events from CSV, Excel, and ODS files. Many public data sources — government APIs, event platforms, research databases — expose their data as JSON APIs rather than downloadable files. Users wanting to import from these sources had to manually convert JSON to CSV before uploading, or use external tools. Scheduled imports that fetched JSON URLs silently failed because the pipeline only understood tabular formats.

The import pipeline (see ADR 0004) expects tabular data: rows with consistent columns. JSON APIs return nested structures with arrays of objects, often paginated across multiple HTTP requests. A conversion layer is needed between the HTTP fetch and the existing pipeline.

## Decision

### JSON→CSV Conversion at the Fetch Boundary

JSON responses are converted to CSV **before** entering the import pipeline. The existing pipeline (schema detection → validation → geocoding → event creation) remains unchanged — it always receives CSV.

The conversion happens in `fetchRemoteData()`, the unified fetch service used by both the wizard and scheduled imports:

```
HTTP fetch → detect JSON → convert to CSV → existing pipeline
```

**Key modules:**

| Module                                               | Purpose                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `lib/import/json-to-csv.ts`                          | Parses JSON, finds records array, flattens nested objects, generates CSV via Papa Parse |
| `lib/import/fetch-remote-data.ts`                    | Unified fetch service: auth → fetch → detect type → convert if JSON → hash              |
| `lib/jobs/handlers/url-fetch-job/paginated-fetch.ts` | Fetches multiple pages from paginated APIs, collects all records                        |

### Records Path Detection

JSON APIs wrap records in various structures: `{"data": [...]}`, `{"results": [...]}`, `[...]` (top-level array), `{"response": {"items": [...]}}`. The system auto-detects the records array:

1. If top-level is an array of objects → use it
2. If top-level is an object → find the first property whose value is an array of objects
3. If user specifies `recordsPath` (e.g., `"data.results"`) → use that path directly

Shared implementation: `extractRecordsFromJson()` in `json-to-csv.ts`, used by both single-response conversion and paginated fetching.

### Nested Object Flattening

JSON records with nested objects are flattened to dot-separated CSV columns:

```json
{ "user": { "name": "John", "age": 30 }, "city": "Berlin" }
```

Becomes CSV columns: `user.name`, `user.age`, `city`. Arrays are serialized as JSON strings (e.g., `tags` → `["a","b"]`).

### Pagination Strategies

Three pagination modes for scheduled imports:

| Mode     | How it works                                        | Stop condition                         |
| -------- | --------------------------------------------------- | -------------------------------------- |
| `offset` | Increments offset by `limitValue` each page         | Records < limitValue, or total reached |
| `page`   | Increments page number starting at 1                | Records < limitValue, or total reached |
| `cursor` | Reads next cursor from response (configurable path) | Cursor is null/empty                   |

Safety limits: `maxPages` (default 50, hard cap 500), `MAX_TOTAL_RECORDS` (100,000).

### Unified Fetch Service

Previously, the wizard's URL preview and the scheduled import job had separate fetch implementations. Now both use `fetchRemoteData()`:

- **Wizard**: `fetchRemoteData({ sourceUrl, maxRetries: 0, timeout: 60s })` → preview
- **Scheduled job**: `fetchRemoteData({ sourceUrl, maxRetries: 3, timeout: 30min, jsonApiConfig, cacheOptions })` → import

This ensures JSON support, error handling, and file type detection are consistent across both paths.

### Where JSON Is Supported

| Path                  | JSON Support                                                                         |
| --------------------- | ------------------------------------------------------------------------------------ |
| Wizard file upload    | Yes — JSON files auto-converted to CSV for preview                                   |
| Wizard URL input      | Yes — JSON URLs auto-detected and converted                                          |
| Scheduled imports     | Yes — with optional pagination and configurable recordsPath                          |
| Manual Payload upload | No — `application/json` removed from `ALLOWED_MIME_TYPES` on import-files collection |

Manual Payload uploads (via REST API or admin dashboard) reject JSON because the afterChange hook pipeline doesn't support it. All JSON handling happens at the fetch/upload layer before the pipeline.

### Scheduled Import Configuration

New fields on the `scheduled-imports` collection (`advancedOptions`):

- `responseFormat`: `auto` | `csv` | `json` — force or auto-detect response format
- `jsonApiConfig.recordsPath`: dot-path to records array
- `jsonApiConfig.pagination`: type, params, limits, cursor config

## Consequences

### Positive

- Users can import from JSON APIs without manual conversion
- Scheduled imports can paginate through large API datasets
- One fetch path for wizard and jobs — bugs fixed once, not twice
- Existing pipeline unchanged — no risk to CSV/Excel imports

### Negative

- All records from paginated APIs are collected in memory before CSV conversion (max 100k records safety limit)
- Nested JSON structures deeper than 2 levels produce long column names (`a.b.c.d`)
- Auto-detection can pick the wrong array in complex JSON responses — user must configure `recordsPath`

### Future Work

- Streaming conversion for very large JSON responses (avoid memory accumulation)
- GeoJSON support as a recognized format
- Server-side credential storage for wizard sessions (avoid re-entry on refresh)
