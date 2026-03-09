# ADR 0003: Data Architecture

## Status

Accepted

## Context

TimeTiles manages geospatial event data imported from CSV, Excel, and ODS files or scheduled URLs. The data model must support:

- Hierarchical organization (catalogs, datasets, events)
- Public/private visibility with efficient access control
- Schema evolution across repeated imports
- Event deduplication across import runs
- Geospatial storage and querying

These requirements create tension between normalization (single source of truth) and query performance (zero-join access checks). This ADR documents the trade-offs made.

## Decision

### Entity Hierarchy

```
Users
 |
 |-- owns --> Catalogs (1:N)
 |              |
 |              +-- contains --> Datasets (1:N)
 |                                 |
 |                                 +-- contains --> Events (1:N)
 |                                 |
 |                                 +-- has --> DatasetSchemas (1:N, versioned)
 |
 |-- owns --> ImportFiles (1:N)
 |              |
 |              +-- produces --> ImportJobs (1:N)
 |                                 |
 |                                 +-- creates --> Events (1:N)
 |
 |-- owns --> ScheduledImports (1:N)
 |              |
 |              +-- triggers --> ImportFiles (1:N)
 |
 +-- owns --> Views (1:N)
```

**Core data path:** Catalog -> Dataset -> Event

**Import path:** ScheduledImport -> ImportFile -> ImportJob -> Event

**Schema path:** Dataset -> DatasetSchema (versioned)

#### Key Relationships

| Parent | Child | Cardinality | Foreign Key |
|--------|-------|-------------|-------------|
| Catalog | Dataset | 1:N | `dataset.catalog` |
| Dataset | Event | 1:N | `event.dataset` |
| Dataset | DatasetSchema | 1:N | `datasetSchema.dataset` |
| ImportFile | ImportJob | 1:N | `importJob.importFile` |
| ImportJob | Event | 1:N | `event.importJob` |
| ScheduledImport | ImportFile | 1:N | `importFile.scheduledImport` |
| User | Catalog | 1:N | `catalog.createdBy` |
| User | ImportFile | 1:N | `importFile.user` |
| User | ScheduledImport | 1:N | `scheduledImport.createdBy` |
| User | View | 1:N | `view.createdBy` |

Reference: `lib/collections/catalogs.ts`, `lib/collections/datasets.ts`, `lib/collections/events.ts`, `lib/collections/import-files.ts`, `lib/collections/import-jobs/index.ts`, `lib/collections/scheduled-imports/index.ts`, `lib/collections/views/index.ts`

### Public/Private Visibility Model

Visibility is top-down. Both the catalog and the dataset must be public for events to be accessible to anonymous or non-owner users.

```
Catalog.isPublic = true
  AND Dataset.isPublic = true
    => Events are public

Catalog.isPublic = false
  => ALL datasets and events are private (regardless of dataset.isPublic)

Catalog.isPublic = true
  AND Dataset.isPublic = false
    => ERROR: hook rejects this state
```

#### Rules

1. **Both gates must be open.** A dataset's events are only public when `catalog.isPublic AND dataset.isPublic` are both true.
2. **A private dataset cannot exist in a public catalog.** The `validateDatasetVisibility` hook in `lib/collections/datasets/hooks.ts` throws if `catalog.isPublic === true && dataset.isPublic === false`.
3. **Feature flag gate.** The `allowPrivateImports` feature flag controls whether private data is allowed at all. When disabled, both catalogs and datasets are forced public. Enforced in `beforeChange` hooks on both collections.
4. **Catalog owner bypass.** The catalog owner can always see all datasets and events in their catalog, regardless of visibility settings.

Reference: `lib/collections/catalogs.ts` (lines 23-29), `lib/collections/datasets/hooks.ts` (lines 57-62), `lib/collections/datasets/access.ts`

### Denormalization Strategy

Events and datasets store copies of parent fields to enable zero-query access control. Payload's access control runs on every request; joining to the catalog table each time would be expensive.

#### Denormalized Fields

| Collection | Field | Source | Purpose |
|------------|-------|--------|---------|
| Dataset | `catalogCreatorId` | `catalog.createdBy` | Owner access check without catalog join |
| Dataset | `catalogIsPublic` | `catalog.isPublic` | Public access check without catalog join |
| Event | `datasetIsPublic` | `dataset.isPublic AND catalog.isPublic` | Combined visibility in one field |
| Event | `catalogOwnerId` | `catalog.createdBy` | Owner access check without any joins |

All four fields are indexed.

#### Cascade Sync

When a catalog's `isPublic` or `createdBy` changes, hooks propagate the change downward:

```
Catalog afterChange hook
  |
  +-- Update all child Datasets: catalogIsPublic, catalogCreatorId
  |
  +-- For each Dataset:
        +-- Update all child Events: datasetIsPublic, catalogOwnerId
```

When a dataset's `isPublic` changes:

```
Dataset afterChange hook
  |
  +-- Update all child Events: datasetIsPublic
```

When an event is created, the `eventsBeforeChangeHook` fetches the dataset (with catalog at depth 1) and sets both denormalized fields.

#### Trade-offs

- **Faster reads:** Access control returns a WHERE clause on indexed fields. No joins, no subqueries.
- **Sync complexity:** Changing a catalog's visibility triggers a cascade update across datasets and events. Large catalogs produce many writes.
- **Eventual consistency window:** During the cascade, some events may briefly have stale visibility values. This is acceptable because visibility changes are infrequent admin operations.

Reference: `lib/collections/catalogs.ts` (lines 66-106), `lib/collections/datasets/hooks.ts` (lines 138-160), `lib/collections/events/hooks.ts` (lines 18-34), `lib/collections/events.ts` (lines 103-119)

### Schema Versioning

Schemas are stored in a separate `dataset-schemas` collection, one document per version per dataset.

#### Schema Document Structure

| Field | Type | Description |
|-------|------|-------------|
| `dataset` | relationship | Parent dataset |
| `versionNumber` | number | Auto-incremented per dataset |
| `schema` | json | JSON Schema Draft 7 |
| `fieldMetadata` | json | Field statistics (types, cardinality, nullability) |
| `eventCountAtCreation` | number | Snapshot of dataset size at schema creation |
| `schemaSummary.totalFields` | number | Field count |
| `schemaSummary.newFields` | array | Fields added in this version |
| `schemaSummary.removedFields` | array | Fields removed in this version |
| `schemaSummary.typeChanges` | array | Fields whose types changed (old + new) |
| `schemaSummary.enumChanges` | array | Enum value additions/removals per field |
| `fieldMappings` | group | Detected mappings for title, description, location, timestamp |
| `approvalRequired` | checkbox | Whether this version needs manual approval |
| `autoApproved` | checkbox | Whether it was auto-approved as a safe change |
| `conflicts` | json | Conflicts requiring manual resolution |
| `importSources` | array | Import jobs that contributed to this version |

#### Schema Evolution Flow

1. Import job reaches `detect-schema` stage, builds schema from data.
2. `validate-schema` stage compares new schema against the dataset's latest version.
3. If changes are non-breaking and `autoApproveNonBreaking` is enabled on the dataset, the new version is auto-approved.
4. If breaking changes are detected (type changes, removed fields), the import enters `await-approval` and pauses.
5. On approval, a new `dataset-schemas` document is created with the incremented version number.

Breaking change types: removed fields, type changes, removed enum values.

Safe changes (auto-approvable): new optional fields, new enum values.

#### Dataset Schema Configuration

The dataset's `schemaConfig` group controls behavior:

| Setting | Default | Effect |
|---------|---------|--------|
| `enabled` | false | Enable schema detection and validation |
| `locked` | false | Require manual approval for ALL changes |
| `autoGrow` | true | Allow automatic schema growth (new fields, new enums) |
| `autoApproveNonBreaking` | false | Auto-approve non-breaking changes |
| `strictValidation` | false | Block entire import on any validation failure |
| `maxSchemaDepth` | 3 | Maximum nesting depth for schema detection |
| `enumThreshold` | 50 | Threshold for enum detection |

Reference: `lib/collections/dataset-schemas.ts`, `lib/collections/datasets.ts` (lines 173-260), `lib/collections/import-jobs/fields.ts` (lines 93-273)

### Event Identity and Deduplication

Each event has a `uniqueId` field (required, unique, indexed) with the format `datasetId:strategy:value`. The strategy for generating this ID is configured per dataset.

#### ID Strategies

| Strategy | `idStrategy.type` | How `uniqueId` is computed |
|----------|-------------------|----------------------------|
| External | `external` | Uses a field from the source data (configured via `externalIdPath`) |
| Computed | `computed` | SHA256 hash of selected fields (configured via `computedIdFields`) |
| Auto | `auto` | Auto-detects duplicates by hashing all content fields |
| Hybrid | `hybrid` | Tries external ID first, falls back to computed hash |

#### Duplicate Handling Strategies

When a duplicate is found (matching `uniqueId` or `contentHash`), the dataset's `idStrategy.duplicateStrategy` controls what happens:

| Strategy | `duplicateStrategy` | Behavior |
|----------|---------------------|----------|
| Skip | `skip` | Ignore the duplicate row, keep the existing event |
| Update | `update` | Overwrite the existing event with new data |
| Version | `version` | Create a new version of the existing event |

#### Supporting Fields on Events

| Field | Type | Purpose |
|-------|------|---------|
| `uniqueId` | text (unique, indexed) | Primary deduplication key |
| `sourceId` | text (indexed) | Original ID from source system |
| `contentHash` | text (indexed) | SHA256 of data content for content-based dedup |
| `importBatch` | number (indexed) | Batch number within an import |

The import job tracks deduplication results in its `duplicates` group: internal duplicates (within the import), external duplicates (against existing events), and a summary with counts.

Reference: `lib/collections/datasets.ts` (lines 110-172, 262-291), `lib/collections/events.ts` (lines 339-373), `lib/collections/import-jobs/fields.ts` (lines 287-358)

### Geospatial Data

#### Event Location Fields

| Field | Type | Description |
|-------|------|-------------|
| `location.latitude` | number | WGS84 latitude |
| `location.longitude` | number | WGS84 longitude |
| `coordinateSource.type` | select | How coordinates were obtained |
| `coordinateSource.confidence` | number (0-1) | Confidence in coordinate accuracy |
| `coordinateSource.validationStatus` | select | Coordinate validation result |
| `locationName` | text | Human-readable venue/place name |
| `geocodingInfo.originalAddress` | text | Original address string from import |
| `geocodingInfo.geocodingStatus` | select | pending, success, failed |
| `geocodingInfo.provider` | select | google, nominatim, manual |
| `geocodingInfo.confidence` | number (0-1) | Geocoding confidence score |
| `geocodingInfo.normalizedAddress` | text | Address returned by geocoder |

#### Coordinate Sources

| Source | `coordinateSource.type` | Description |
|--------|-------------------------|-------------|
| Import | `import` | Lat/lng columns existed in the source file |
| Geocoded | `geocoded` | Address was geocoded to coordinates |
| Manual | `manual` | User entered coordinates manually |
| None | `none` | No coordinates available |

When source is `import`, additional metadata tracks which columns contained the coordinates and their format (decimal, DMS, etc.).

#### Coordinate Validation

The `coordinateSource.validationStatus` field flags quality issues:

| Status | Meaning |
|--------|---------|
| `valid` | Coordinates are within normal ranges |
| `out_of_range` | Latitude outside [-90, 90] or longitude outside [-180, 180] |
| `suspicious_zero` | Both coordinates are exactly 0 (likely missing data) |
| `swapped` | Latitude and longitude appear to be swapped |
| `invalid` | Coordinates could not be parsed |

#### Database Indexes

Events have B-tree indexes on `location.latitude` and `location.longitude` for bounding-box queries. PostGIS geometry is used for clustering and spatial operations at the query layer (see API endpoints), but the collection itself stores coordinates as plain numbers.

The dataset's `geoFieldDetection` group controls auto-detection of lat/lng columns during import, with optional manual overrides via `fieldMappingOverrides`.

Reference: `lib/collections/events.ts` (lines 139-246, 406-432), `lib/collections/datasets.ts` (lines 331-424)

## Consequences

- **Fast access control:** Denormalized fields let access checks run as simple WHERE clauses on indexed columns. No joins needed for the most common operation (reading events).
- **Cascade complexity:** Changing a catalog's visibility or ownership triggers updates across datasets and events. This is acceptable because these changes are rare admin operations, not hot-path mutations.
- **Schema versioning overhead:** Every import compares schemas and may create a new version document. This adds latency to imports but provides full audit trail and breaking-change detection.
- **Flexible deduplication:** Four ID strategies and three duplicate-handling strategies cover common import patterns (open data with stable IDs, CSV dumps without IDs, hybrid sources).
- **Dual coordinate storage:** Storing lat/lng as plain numbers (for Payload CMS compatibility) alongside PostGIS geometry (for spatial queries) means coordinates exist in two forms. The numbers are the source of truth; PostGIS geometry is derived.
- **Visibility invariant enforcement:** The hook that prevents private datasets in public catalogs simplifies reasoning about access. The denormalized `datasetIsPublic` on events can be a single boolean combining both gates, rather than requiring two checks.
