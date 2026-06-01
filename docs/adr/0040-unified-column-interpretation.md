# ADR 0040: Unified Column Interpretation Plan

## Status

Accepted

Supersedes [ADR 0025: Field Transforms and Data Normalization](0025-field-transforms.md).

## Context

Turning a raw imported cell into a final, typed event value was split across **two
overlapping mechanisms applied at three to four pipeline stages**, with no single home
for the question "how is this column interpreted?":

- `dataset.ingestTransforms` — an ordered union of structural rewrites (`rename`,
  `date-parse`, `string-op`, `concatenate`, `split`, `parse-json-array`,
  `split-to-array`, `extract`) applied _before_ schema detection (`lib/ingest/transforms.ts`).
- `dataset.fieldMappingOverrides` — the semantic role paths (`titlePath` … `coordinatePath`)
  plus the per-column interpretation knobs (`coordinateFormat`, `timestampOrder`,
  `endTimestampOrder`), merged over the detector's proposal and persisted onto
  `ingest-jobs.detectedFieldMappings`, then read _after_ detection at event creation.

This split was the root cause of a recurring class of bug: **a per-column property
guessed per row**. Combined-coordinate axis order had already been fixed as a per-column
decision (`coordinateFormat` + an `AMBIGUOUS_COORDINATE_ORDER` review gate), but the date
day/month order was still inferred per row in `inferDayMonthOrder` — so `13/02` resolved
to DD/MM while `01/02` resolved to MM/DD _within the same column_, silently corrupting
half the rows. The same shape recurred elsewhere: `geoFieldDetection.lat/lng` duplicated
the override paths, field-type classification ran twice (once in detection metadata, once
at create-events), and transforms were applied two to four times guarded by ISO re-parse
heuristics.

Because the product had **not yet launched**, there was no production data to preserve —
a clean break was available rather than a backward-compatible migration.

## Decision

Adopt **one declarative artifact** that describes how every column becomes a typed value,
consumed by a **single normalizer** shared between detection and extraction. This removes
the seam and gives per-column interpretation exactly one home.

### The model

`DatasetInterpretationPlan` (`lib/ingest/types/interpretation.ts`):

```typescript
interface DatasetInterpretationPlan {
  ops: IngestTransform[]; // ordered, verbatim structural rewrites (replayed in order)
  columns: ColumnInterpretation[]; // order-independent per-column typing (kind + policy + detection)
  roles: InterpretationRoles; // semantic field paths (title, timestamp, coordinate, …)
  ambiguityResolution: "strict" | "best-effort";
}
```

The split between `ops` and `columns` is load-bearing:

- **`ops` is a single flat ordered list**, replayed byte-for-byte. It is never grouped
  per column, because reordering a `string-op` relative to a `rename` of the same column
  changes the output (`"ada"` → `"ADA"` only if uppercase precedes the rename).
- **`columns` is order-independent typing** — what each _final_ column resolves to
  (`kind`: string/number/date/coordinate-pair/…; `policy`: the date `DateOrder` or
  coordinate `CoordinateOrder`; `detection`: confidence + an optional `requiresChoice`).

`ambiguityResolution` is **the knob**, and it lives on the plan (not as a standalone
`dataset.resolutionMode` field):

- `strict` (default for wizard datasets, where the user explicitly configured mappings):
  an ambiguous column with no confirmed order yields no value and **trips a review gate** —
  the pipeline asks rather than guesses.
- `best-effort` (default for auto-detected and data-package datasets): the legacy per-row
  guessers (`inferDayMonthOrder`, coordinate salvage) become the explicit opt-in path; the
  gate is suppressed.

### The normalizer

`interpretRow(row, plan, { only? })` / `interpretRows` (`lib/ingest/interpret.ts`) is the
single chokepoint. It replays `plan.ops` (subsuming the old `applyTransforms`), and both
schema detection and event creation call it. `planFromOps(ops)` wraps a bare ordered list
as an ops-only plan for the few call sites that hold transforms rather than a full plan.

### Storage — `type: "json"`, two scopes

The plan is persisted verbatim as a Payload `type: "json"` field named `interpretationPlan`
on **both** collections:

- `datasets.interpretationPlan` — the **authored** plan (wizard / data-package intent,
  pre-detection).
- `ingest-jobs.interpretationPlan` — the **detection-resolved** plan (authored `ops` +
  detected/merged `roles` + resolved column policies), snapshotted per job with the same
  resume/retry semantics the old `detectedFieldMappings` had.

JSON was chosen over a typed Payload group deliberately: a typed group with `select` fields
for the order/kind enums would hit the 63-character Postgres enum-name limit on the
`_datasets_v` / `_ingest_jobs_v` version tables (the same wall that already forced
`coordinateFormat`/`timestampOrder` to free-text `varchar`), and a Payload group cannot
model the discriminated union of eight transform types without flattening into the
all-optional shape that defeated the purpose. JSON stores the self-describing TS type
verbatim with zero enum churn, matching the existing `configSnapshot` / `schemaBuilderState`
/ `fieldMetadata` precedent. The trade-off — readers see `unknown` — is handled by a single
typed narrower, `readInterpretationPlan(record)`, mirroring `readConfigSnapshot`.

### Which plan each stage reads

| Stage                                | Plan source                                  | Why                                                                         |
| ------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| `analyze-duplicates` (pre-detection) | **dataset** plan `ops`                       | the job plan isn't resolved yet; dedup hashes the authored transform output |
| `detect-schema`                      | reads dataset `ops`, writes the **job** plan | resolves roles + column policies from the detector proposal                 |
| `geocode-batch`, `create-events`     | **job** plan                                 | the resolved roles/orders the detector settled                              |

### Plan assembly

`lib/ingest/plan-builder.ts` is the single place that assembles either plan form:

- `buildPlanFromWizard(fieldMapping, transforms, "strict")` — the authored dataset plan.
- `buildPlanFromPaths(...)` — the data-package manifest authored plan (`best-effort`; a
  manifest may pin orders so unattended imports never stall on the gate).
- `buildDetectionPlan(...)` — the detection-resolved job plan.
- `planToFieldMappings(plan)` / `planToSchemaFieldMappings(plan)` — read adapters that
  project the plan back to the flat path/order shape the extractors and schema-version
  snapshot still speak, so their internal logic is untouched.

### Ambiguity → a generic review gate

`detection.requiresChoice` generalizes the old coordinate-only `requiresUserChoice`.
`AMBIGUOUS_INTERPRETATION_CHECKS` is a descriptor table driven by
`shouldReviewAmbiguousInterpretation`; combined-coordinate axis order and date day/month
order are each one row in that table, and adding a future ambiguous dimension is one more
row. The gates operate on the flat in-memory mappings (carrying the `"ambiguous"` sentinel)
that `finalizeSchemaDetection` returns _before_ the plan is persisted, so the gate logic
needed no change. The review-panel order picker and the approve route write the confirmed
order into the matching `plan.columns[].policy` on both the dataset and job plans, which is
what makes a resolved order survive a detection re-run (replacing the old
override-precedence-on-resume mechanism).

### The load-bearing invariant: dedup-hash stability

`generateUniqueId` hashes the row _after_ `ops` is replayed. For content-hash datasets, the
dedup ID must not change. Stability is structural, not incidental: the plan-builder funnels
authored transforms through the **unchanged** `buildTransformsFromDataset` active/complete
filter, so `plan.ops` is byte-identical to the historical `dataset.ingestTransforms`
round-trip. `tests/unit/ingest/plan-hash-stability.test.ts` (re-anchored from the
Phase-0 golden test) asserts `generateUniqueId(plan-ops row) === generateUniqueId(legacy
buildTransformsFromDataset row)` across a transform corpus, keeping the legacy path as the
expected value so the new path is tested against historical semantics rather than itself.

### Removed

`dataset.ingestTransforms`, `dataset.fieldMappingOverrides`, and
`ingest-jobs.detectedFieldMappings` are dropped outright (no backfill — pre-launch).
Migration `20260601_171009_add_interpretation_plan_drop_legacy_groups` adds the four
`interpretation_plan` jsonb columns (base + version tables) and drops the legacy columns,
the `ingestTransforms` array sub-tables, and their enum types, with a faithful `down()`.
`buildTransformsFromDataset` / `collectTransformsForTargetPath` are retained — the former
as the byte-identical authoring filter and hash-test anchor, the latter for the `interpret`
`only` projection.

## Consequences

- Per-column interpretation has exactly one home; the detection/extraction seam is gone
  (both call `interpretRow`), eliminating the per-row-vs-per-column bug class. The silent
  date day/month corruption is fixed: an ambiguous order pauses for review (`strict`) or is
  an explicit opt-in guess (`best-effort`), never a silent per-row coin flip.
- The strict-by-default behavior means a mid-latitude DD/MM file with no confirmed order
  now pauses the wizard for an order choice rather than importing silently-wrong dates.
  Unattended (data-package / auto-detected) imports default to `best-effort` to preserve
  prior throughput; a manifest can pin orders to avoid stalling.
- Two plan scopes (authored dataset vs resolved job) must not be confused; the table above
  is the contract, and the `configSnapshot` freezes the dataset plan for deterministic
  re-runs.
- Storing the plan as JSON means it is machine-authored only — there is no admin-panel field
  editor for individual transforms as there was for the `ingestTransforms` array. This is
  acceptable because the wizard and detector author it; if hand-editing is ever needed, a
  dedicated admin UI would read/write the JSON.
- `buildTransformsFromDataset` survives purely as the authoring filter and hash anchor; its
  name now refers to a structural `{ ingestTransforms? }` input rather than a stored Payload
  field.
- ADR 0025's six-transform table is superseded; the surviving structural transforms live in
  `lib/ingest/types/transforms.ts` and the `expr-eval` sandbox for `string-op` expressions
  is carried over unchanged. ADR 0030 (workflow orchestration), ADR 0033 (review checks and
  ID strategy), and the dedup / geocode-cache / quota machinery are unaffected.
