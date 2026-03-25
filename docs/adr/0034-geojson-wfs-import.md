# ADR 0034: GeoJSON and WFS Import

## Status

Accepted

## Context

Many open data portals — especially in Germany (Berlin, Hamburg, federal agencies) — publish geospatial data via OGC Web Feature Service (WFS). WFS endpoints serve vector features as GeoJSON, a standard format with geometry and properties per feature. Users wanted to import data from URLs like `https://gdi.berlin.de/services/wfs/behindertenparkplaetze` without manual conversion.

TimeTiles already supported JSON API import (ADR 0028) using a "convert to CSV at intake" pattern. GeoJSON is structurally different from JSON APIs: instead of an array of flat records, it contains a `FeatureCollection` with `Feature` objects that have separate `geometry` and `properties` fields. The geometry provides coordinates directly, making geocoding unnecessary.

Two OGC protocols exist for geospatial data:

- **WMS** (Web Map Service): serves raster images — not importable as data
- **WFS** (Web Feature Service): serves vector features as GeoJSON/GML — importable

## Decision

### GeoJSON-to-CSV Conversion at Intake

Following the same pattern as JSON API import (ADR 0028), GeoJSON is converted to CSV **before** entering the import pipeline. A new `geojson-to-csv.ts` module handles the conversion:

```
GeoJSON FeatureCollection → flatten properties → extract coordinates → CSV
```

**Key design choices:**

| Choice              | Decision                           | Rationale                                                                   |
| ------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| Conversion strategy | GeoJSON → CSV at intake            | Reuses entire existing pipeline unchanged                                   |
| Coordinate columns  | `latitude` / `longitude`           | Matches existing detection patterns — no changes to schema detection needed |
| Centroid extraction | Bounding box center                | Avoids Turf.js dependency; sufficient for event-level mapping               |
| GeoJSON detection   | Content-sniffing for `.json` files | WFS endpoints often return `application/json`, not `application/geo+json`   |
| WFS URL handling    | Auto-normalize with missing params | Users can paste bare WFS URLs without knowing the protocol details          |

### Conversion Details

For each GeoJSON `Feature`:

1. **Properties** are flattened into CSV columns using the existing `flattenObject()` from `json-to-csv.ts`
2. **Geometry** is converted to a centroid and injected as `latitude` / `longitude` columns
3. **Feature ID** (if present) is preserved as `_feature_id`

Centroid extraction supports all GeoJSON geometry types:

| Geometry Type                | Centroid Method              |
| ---------------------------- | ---------------------------- |
| Point                        | Direct coordinate extraction |
| MultiPoint                   | Average of all points        |
| Polygon / MultiPolygon       | Bounding box center          |
| LineString / MultiLineString | Bounding box center          |
| GeometryCollection           | First geometry's centroid    |
| null                         | No coordinates injected      |

### WFS URL Normalization

Users often paste bare WFS URLs without query parameters. The `normalizeWfsUrl()` helper auto-appends missing WFS parameters:

```
Input:  https://gdi.berlin.de/services/wfs/behindertenparkplaetze
Output: https://gdi.berlin.de/services/wfs/behindertenparkplaetze?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json
```

Detection triggers on `/wfs/` in the URL path or `service=WFS` in query parameters.

### Three Intake Points

GeoJSON conversion is wired into the same three intake points as JSON:

| Intake Point          | File                             | Behavior                                               |
| --------------------- | -------------------------------- | ------------------------------------------------------ |
| Upload preview        | `preview-schema/upload/route.ts` | `.geojson` files and `.json` files detected as GeoJSON |
| URL fetch             | `fetch-remote-data.ts`           | GeoJSON detected before JSON; WFS URLs auto-normalized |
| Dataset detection job | `dataset-detection-job.ts`       | `.geojson` and GeoJSON-sniffed `.json` files converted |

### Geocoding Skip

When `latitude` and `longitude` columns are present in the field mappings, the geocode-batch job already skips geocoding and reads coordinates directly from the row data. Since the converter injects these columns from geometry, **no changes to the geocoding pipeline were needed**.

### Scheduling

GeoJSON/WFS URLs work with the existing `ScheduledIngests` system. The `responseFormat: "geojson"` option forces GeoJSON detection. For `auto` mode, WFS responses are content-sniffed automatically.

## Consequences

### Positive

- Users can import from thousands of German (and international) open data WFS endpoints
- No geocoding costs for GeoJSON imports — coordinates come from geometry
- Follows established "convert to CSV at intake" pattern — no pipeline changes needed
- WFS URL normalization lowers the barrier for non-technical users
- `.geojson` file upload works alongside existing CSV/Excel/ODS/JSON formats

### Negative

- Bounding box centroid is an approximation for polygon geometries (sufficient for event mapping, not for precision GIS)
- Content-sniffing every `application/json` response adds one JSON parse for GeoJSON detection
- WFS pagination (`startIndex`/`count`) is not yet supported — large WFS datasets may be truncated by server-side limits
- No WFS `GetCapabilities` layer discovery — users must know or construct the correct WFS URL

### Not Addressed

- **WMS display**: Showing WMS raster layers as map overlays is a separate feature (display, not import)
- **Full WFS client**: Layer browsing via `GetCapabilities`, spatial/attribute filtering via WFS query parameters
- **GML support**: Only GeoJSON output format is supported; GML responses require `outputFormat=application/json`
- **Streaming**: Large GeoJSON files (>50 MB) are loaded into memory; streaming GeoJSON parsing could be added later
