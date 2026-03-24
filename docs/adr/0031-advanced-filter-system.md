# ADR 0031: Advanced Filter System

## Status

Proposed

## Date

2026-03-24

## Context

The current filter system is functional for basic use cases but has structural limitations that prevent power users and dataset administrators from customizing the filtering experience.

### Current State

**Three hardcoded filter components** compose the filter panel in `components/filters/event-filters.tsx`:

- `DataSourceSelector` — catalog/dataset selection with cards and chips
- `TimeRangeSlider` — dual-handle date range slider with histogram
- `CategoricalFilters` — auto-generated enum field dropdowns (via `EnumFieldDropdown`)

**Filter state** is managed via URL parameters in `lib/hooks/use-filters.ts` using `nuqs`. The `FilterState` type (`lib/types/filter-state.ts`) contains `catalog`, `datasets`, `startDate`, `endDate`, and `fieldFilters` as `Record<string, string[]>`.

**Canonical filter model** (`lib/filters/canonical-event-filters.ts`) centralizes resolved filters into `CanonicalEventFilters`, consumed by three output adapters: `to-sql-conditions.ts` (raw SQL), `to-payload-where.ts` (Payload CMS queries), and `to-jsonb-payload.ts` (PostGIS function arguments).

**Enum field discovery** (`lib/hooks/use-dataset-enum-fields.ts`) auto-detects filterable fields from `fieldMetadata` JSON on the datasets collection using hardcoded heuristics: `isEnumCandidate === true`, 2–30 unique values, 50%+ occurrence rate, sorted by distance from ideal cardinality of 10, capped at 5 fields. Labels are derived from field paths via `humanizeFieldPath()`.

**Field filtering is equality-only.** The SQL adapter uses `(e.original_data #>> string_to_array(${fieldKey}, '.')) IN (...)` for all field filters. No range, text search, boolean, or comparison operators exist.

**No editor control.** The `datasets` collection stores `fieldMetadata` as a read-only JSON field. There is no mechanism for dataset owners to enable/disable specific filters, override auto-detected types, or customize labels.

**Categorical filters require single dataset selection.** `event-filters.tsx` only fetches enum fields when exactly one dataset is selected, because field paths are dataset-specific.

### Limitations

1. Editors cannot control which fields appear as filters or customize their labels
2. Only equality matching (`IN`) — no "contains", greater/less than, or range operators
3. Numeric fields with `numericStats` in `FieldStatistics` are never surfaced as filters
4. Boolean fields are not rendered as checkboxes
5. No simple/advanced mode — all detected filters appear or none do
6. Enum detection heuristics are not overridable per dataset

## Decision

Extend the filter system in three incremental phases, preserving the existing canonical filter model and URL-synced state architecture.

### Phase 1: Editor Control

Add a `filterConfig` JSON field to the `datasets` collection alongside existing `fieldMetadata`:

```json
{
  "fields": {
    "category": { "enabled": true, "label": "Event Type", "priority": 1 },
    "status": { "enabled": false },
    "price": { "enabled": true, "label": "Price", "type": "range", "priority": 2 }
  }
}
```

Each entry maps a field path to:

- `enabled` (boolean) — override auto-detection; `false` hides the field even if it is an enum candidate
- `label` (string, optional) — override `humanizeFieldPath()` output
- `type` (string, optional) — override auto-detected filter type (`enum`, `range`, `text`, `boolean`)
- `priority` (number, optional) — controls display order; lower number = higher priority

**Changes required:**

- `lib/collections/datasets.ts` — add `filterConfig` JSON field (editor/admin writable)
- `lib/hooks/use-dataset-enum-fields.ts` — merge `filterConfig` with `fieldMetadata` heuristics
- Database migration for the new column

### Phase 2: Additional Filter Types

Extend the filter UI with new component types driven by field metadata:

| Filter Type       | Component           | Data Source                                 | SQL Operator    |
| ----------------- | ------------------- | ------------------------------------------- | --------------- |
| `enum` (existing) | `EnumFieldDropdown` | `enumValues` from `fieldMetadata`           | `IN (...)`      |
| `range` (new)     | `RangeSlider`       | `numericStats.min/max` from `fieldMetadata` | `>= AND <=`     |
| `text` (new)      | `TextSearchInput`   | User input                                  | `ILIKE '%...%'` |
| `boolean` (new)   | `Checkbox`          | Field presence/value                        | `= 'true'`      |

**Changes required:**

- New components: `range-slider.tsx`, `text-search-input.tsx`, `boolean-checkbox.tsx`
- `categorical-filters.tsx` — becomes a filter type dispatcher
- `lib/types/filter-state.ts` — extend `fieldFilters` from `Record<string, string[]>` to `Record<string, FilterValue>` where `FilterValue` is `{ op: 'in' | 'gte' | 'lte' | 'between' | 'contains' | 'eq', values: string[] }`
- `lib/filters/to-sql-conditions.ts` — handle new operators
- `lib/hooks/use-filters.ts` — update URL serialization

**Backward compatibility:** The `ff` URL parameter currently serializes as `{"field":["val1","val2"]}`. The new format: `{"field":{"op":"in","values":["val1"]}}`. The parser accepts both — bare arrays are treated as `{ op: "in", values: [...] }`.

### Phase 3: Simple/Advanced Mode

Add a toggle to the filter panel:

- **Simple mode (default):** Show filters with `priority <= 3`, or top 3 auto-detected fields
- **Advanced mode:** Show all enabled filters

**Changes required:**

- `event-filters.tsx` — add toggle button, pass mode to `CategoricalFilters`
- `use-filters.ts` — add `mode` URL param (`simple` | `advanced`)

## Out of Scope

- **Filter dependencies/computed filters.** Cascading filters add significant complexity with minimal benefit.
- **Per-filter multi-language labels.** Use `next-intl` for UI chrome; `filterConfig.label` is a plain string.
- **Complex validation rules per filter.** No min/max constraints or regex patterns.
- **Filter groups with drag-and-drop.** Priority numbers handle ordering.
- **Geographic bounds as filter panel control.** Bounds filtering already works via the map viewport.

## Consequences

- **Phase 1 is purely additive.** Datasets without `filterConfig` behave exactly as today.
- **Phase 2 changes `fieldFilters` type.** SQL and Payload adapters must handle new operators. Integration tests required for each operator against JSONB `original_data`.
- **URL format change in Phase 2.** Backward-compatible parser ensures existing bookmarked URLs continue to work.
- **Performance consideration.** Text search (`ILIKE`) on JSONB is not indexed. GIN index can be added later based on usage data.
