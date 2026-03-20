# ADR 0025: Field Transforms and Data Normalization

## Status

Accepted

## Context

TimeTiles imports events from CSV, Excel, and ODS files where column names, date formats, and data types vary between sources. A dataset may receive data from multiple providers over time, each using slightly different conventions -- "event_date" vs "date", "DD/MM/YYYY" vs "MM-DD-YYYY", a location split across two columns vs a single address field. Without a normalization layer, every schema change or source variation would require the user to manually reconfigure field mappings or cause schema validation failures that block the import pipeline.

The import pipeline (see ADR 0004) detects schemas and validates them against the dataset's canonical schema. Transforms sit between raw file reading and schema detection, converting incoming data into the shape the dataset expects. This enables schema evolution without breaking existing imports.

## Decision

### Transform Types

Six transform types cover the structural and value normalization needs encountered in real-world imports:

| Type          | Purpose                                                       | Example                                             |
| ------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `rename`      | Map source field to target field                              | `"event_date"` to `"start_date"`                    |
| `date-parse`  | Parse date strings into standardized format                   | `"31/12/2024"` (DD/MM/YYYY) to `"2024-12-31"` (ISO) |
| `string-op`   | Apply string operations (uppercase, lowercase, trim, replace) | Trim whitespace from `"  Berlin  "`                 |
| `concatenate` | Join multiple fields into one                                 | `"street"` + `"city"` to `"address"`                |
| `split`       | Split one field into multiple fields                          | `"Berlin, Germany"` to `"city"` + `"country"`       |
| `type-cast`   | Convert values between types                                  | `"42"` (string) to `42` (number)                    |

Type definitions: `lib/types/import-transforms.ts`. Runtime implementation: `lib/import/transforms.ts`.

### Pipeline Position: Before Schema Detection

Transforms apply **before** schema detection and validation, not after. This is the key architectural choice.

```
Raw file rows
  --> applyTransformsBatch(rows, transforms)
    --> Schema detection (sees normalized column names and types)
      --> Schema validation (compares against canonical schema)
        --> Geocoding
          --> Event creation (applies transforms again per row)
```

Transforms run at two pipeline stages:

1. **Schema detection** (`schema-detection-job.ts`) -- `applyTransformsBatch()` normalizes the entire batch before the `ProgressiveSchemaBuilder` analyzes it. This means the detected schema reflects the post-transform field names and types, so a rename from `"event_date"` to `"start_date"` results in a schema with `start_date`, matching the canonical schema.

2. **Event creation** (`create-events-batch-job.ts`) -- `applyTransforms()` normalizes each row individually before `createEventData()` maps fields to event properties.

If transforms ran after schema detection, every source variation would appear as a schema change requiring user approval. Running them before detection means the pipeline sees a consistent structure regardless of source format.

### Application Order

Transforms are applied **sequentially** in array order. Each transform operates on the result of the previous one. Only transforms with `active: true` are applied. The input data object is shallow-copied before processing to avoid mutating the original.

```typescript
const activeTransforms = transforms.filter((t) => t.active);
for (const transform of activeTransforms) {
  // Each transform modifies the result object in place
}
```

Order matters. A rename from `"date"` to `"start_date"` must execute before a date-parse targeting `"start_date"`. Users control ordering through the array position in the dataset configuration.

### Field Path Resolution

All transforms use dot-notation path accessors (`getByPath`, `setByPath`, `deleteByPath` from `lib/utils/object-path`) to read and write fields. This supports nested structures like `"user.email"` or `"location.coordinates"`, though most CSV/Excel imports are flat single-level objects.

### Expression Evaluation (type-cast custom strategy)

The `type-cast` transform supports four strategies: `parse` (intelligent conversion), `cast` (direct coercion), `reject` (fail on mismatch), and `custom` (user-defined expression).

Custom expressions use the `expr-eval` library (v2) instead of `new Function()` or `eval()`. This is a deliberate security choice:

- **No access to `require`, `process`, `global`, or Node.js APIs** -- expr-eval evaluates mathematical and string expressions only
- **Member access disabled** -- `allowMemberAccess: false` prevents property traversal attacks
- **Predefined helper functions only** -- `upper`, `lower`, `trim`, `len`, `concat`, `replace`, `substring`, `includes`, `startsWith`, `endsWith`, `toNumber`, `parseNumber`, `parseDate`, `parseBool`, `ifEmpty`, `toString`
- **Singleton parser** -- a single `Parser` instance is created at module load and reused across all calls

The expression receives the field value as a `value` variable:

```
upper(value)                        -- uppercase
round(toNumber(value), 2)           -- parse and round
ifEmpty(value, "Unknown")           -- fallback for empty strings
replace(value, "foo", "bar")        -- string replacement
```

Source: `createSafeParser()` and `runCustomTransform()` in `lib/import/transforms.ts`.

### Error Handling

Transforms follow a **keep-original-on-failure** strategy. No single transform failure aborts the import or corrupts the row:

| Transform     | On failure                          | Mechanism                                           |
| ------------- | ----------------------------------- | --------------------------------------------------- |
| `rename`      | Skipped if source field missing     | `getByPath` returns `undefined`                     |
| `date-parse`  | Original string value kept          | `try/catch` around parsing, no `setByPath` on error |
| `string-op`   | Original value kept                 | Falls through to default case                       |
| `concatenate` | Skipped if no valid values          | `values.length > 0` guard                           |
| `split`       | Partial results written             | Iterates `min(toFields.length, parts.length)`       |
| `type-cast`   | Original value kept, warning logged | `try/catch` with `logger.warn()`                    |

The `type-cast` transform with `strategy: "reject"` is the only exception -- it throws intentionally to signal a hard type mismatch. Even then, the outer `try/catch` in `applyTypeCastTransform` catches it, logs a warning, and preserves the original value.

### Storage: Dataset-Level Configuration

Transforms are stored as a JSON array on the `datasets` collection in the `importTransforms` field. This is a Payload CMS array field defined in `lib/collections/datasets/transformation-fields.ts`.

Each transform entry stores:

| Field          | Purpose                                |
| -------------- | -------------------------------------- |
| `id`           | UUID, auto-generated                   |
| `type`         | One of the six transform types         |
| `active`       | Checkbox to disable without deleting   |
| `addedAt`      | Timestamp of creation                  |
| `addedBy`      | Relationship to `users` collection     |
| `confidence`   | Score (0-100) if auto-detected         |
| `autoDetected` | Whether suggested by schema comparison |

Type-specific fields (e.g., `from`, `to`, `inputFormat`, `fromFields`, `strategy`) are conditionally shown in the Payload admin panel based on the selected `type`.

When an import job starts, the `dataset-detection-job` snapshots the dataset's `importTransforms` into the job's `configSnapshot` field. Job handlers then call `buildTransformsFromDataset(dataset)` (`lib/jobs/utils/transform-builders.ts`) to convert the Payload document entries into typed `ImportTransform[]` objects, filtering out inactive or incomplete entries.

### User-Configurable vs Automatic Transforms

Transforms originate from two sources:

**User-configured (import wizard)**: During the import wizard workflow, users can define transforms in the field mapping step. The `configure-service.ts` passes these transforms to `processDataset()`, which writes them to the dataset's `importTransforms` field. Transforms are also transferred between the wizard and flow editor via `sessionStorage` (`lib/import/mapping-transfer.ts`).

**Auto-detected (schema comparison)**: When the `validate-schema-job` detects schema changes (a field removed in the existing schema appears with a similar name in the new data), `detectTransforms()` in `lib/services/schema-builder/schema-comparison.ts` generates `TransformSuggestion` objects. These suggestions score potential renames based on:

- Name similarity via Levenshtein distance (40 points max)
- Type compatibility between old and new fields
- Common rename patterns (e.g., underscore to camelCase)
- Position proximity in the schema

Suggestions with confidence >= 70 are surfaced to the user. The user can accept, modify, or reject them. Accepted suggestions are written to the dataset's `importTransforms` array with `autoDetected: true`.

**Config reuse**: The `config-matcher.ts` module scores how well a new file's headers match existing dataset configurations, including transforms. When a dataset's known columns (from field mapping overrides and transform `from` fields) overlap significantly with the uploaded file's headers, the matcher suggests reusing that dataset's configuration. This allows transforms defined for one import to automatically apply to future imports with the same structure.

## Consequences

- Transforms decouple source format from dataset schema, allowing the same dataset to accept data from multiple providers with different column conventions.
- The before-detection position means transform errors can cause schema detection to see unexpected field names. The keep-original-on-failure strategy mitigates this -- a failed transform produces the raw field name, which triggers a schema change rather than data loss.
- Sequential application creates implicit ordering dependencies between transforms. Users must understand that a rename affects field names seen by subsequent transforms. The UI presents transforms as an ordered list to make this visible.
- The `expr-eval` sandbox trades expressiveness for safety. Users cannot write arbitrary JavaScript, but the predefined function set covers the common cases (string manipulation, type conversion, conditional defaults). Adding new functions requires a code change to `createSafeParser()`.
- Storing transforms on the dataset (not the import job) means all imports into a dataset share the same transform rules. This is intentional -- transforms represent the stable mapping between external formats and the canonical schema. Per-import overrides are not supported; changing transforms affects all future imports.
- The `buildTransformsFromDataset()` builder filters out incomplete entries at runtime, so a partially configured transform in the admin panel (e.g., a rename with no `to` field) is silently skipped rather than causing an error.
