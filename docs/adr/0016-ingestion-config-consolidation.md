# ADR 0016: Ingestion Config Architecture

## Status

Rejected

## Date

2026-03-20

## Context

Import and ingestion configuration is scattered across four Payload CMS collections, each holding a different slice of "how to ingest data":

| Collection          | Config stored                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `datasets`          | `fieldMappingOverrides` (7 path fields), `importTransforms` (6 transform types), `idStrategy` (type + paths), `deduplicationConfig`, `geoFieldDetection`, `schemaConfig` (9 settings), `enumDetection` |
| `import-files`      | File metadata, `datasetMapping`                                                                                                                                                                        |
| `import-jobs`       | Per-run detected schema, field mappings, stage progress                                                                                                                                                |
| `scheduled-imports` | Schedule frequency, auth config, schema mode                                                                                                                                                           |

This layout makes config reuse difficult when re-importing into the same dataset. It also couples "what data we have" (the dataset as a collection of events) with "how to ingest it" (field mappings, transforms, deduplication rules). A user who wants to re-run an import with the same settings must rely on the wizard pre-filling from the dataset, and there is no first-class way to share ingestion config across datasets.

Source: `lib/collections/datasets.ts`, `lib/collections/import-files.ts`, `lib/collections/import-jobs.ts`, `lib/collections/scheduled-imports.ts`

## Proposal

Create a new `IngestionProfile` collection to consolidate all "how to ingest" configuration into a single, reusable entity:

```
ingestion-profiles
├── name, slug
├── fieldMappingOverrides (7 path fields)
├── importTransforms (6 transform types)
├── idStrategy (type + paths)
├── deduplicationConfig
├── geoFieldDetection
├── schemaConfig (9 settings)
├── enumDetection
└── owner (relationship to users)
```

Datasets would hold a relationship to an `ingestion-profiles` record instead of storing config inline. Import jobs would reference the profile that was active at the time of the run. Scheduled imports would reference a profile for their recurring ingestion settings.

## Decision

Rejected.

### Reasons

1. **Wrong abstraction.** Users think of ingestion config as belonging to the dataset, not as a separate entity they must name and manage. Introducing a standalone profile adds a concept that does not map to how users think about their data. The wizard currently asks "how should this file map into your dataset?" -- not "which reusable profile should we apply?"

2. **High migration cost.** The change would touch 30+ source files (collections, hooks, services, job handlers, API routes, wizard components) and 15+ test files. A data migration would need to extract inline config from every existing dataset into new profile records and back-fill the relationships. This is a large, cross-cutting change with high regression risk for a speculative benefit.

3. **YAGNI.** The one-to-many relationship (multiple profiles per dataset) is speculative. In practice, if a dataset receives data from sources with different column layouts, those are different datasets. No user has requested profile sharing, and the current one-to-one relationship between a dataset and its config is sufficient.

4. **Simpler alternatives exist.** The concrete UX problem (reusing config when re-importing) has a much simpler solution: pre-fill the import wizard from the existing dataset config. This requires no new collections, no data migration, and no conceptual overhead for users.

## Alternatives Chosen

Instead of a new collection, three incremental improvements address the underlying concerns:

### A) ID Strategy Protection

Prevent overwriting `idStrategy` on datasets that already have events. Changing the ID strategy after events exist would break deduplication for all subsequent imports. This is a data-integrity guard, implemented as a `beforeChange` hook on the `datasets` collection.

Source: `lib/collections/datasets.ts` (hook)

### B) Config Snapshot on Import Jobs (Future)

Capture the full ingestion config used for each import run as a JSON snapshot on the `import-jobs` record. This provides auditability ("what settings produced these events?") without requiring a separate collection. The snapshot is read-only and serves as a historical record.

### C) Pre-fill Wizard from Dataset Config (Future)

When a user starts a new import into an existing dataset, the wizard pre-fills field mappings, transforms, and other settings from the dataset's current config. The user can adjust before confirming. This solves the config-reuse problem without introducing a new abstraction.

## Consequences

- Import configuration remains on the `datasets` collection. No schema changes, no data migration, no new collection.
- Each alternative (A, B, C) is a small, additive, non-breaking change that can be implemented and shipped independently.
- The coupling between "dataset identity" and "ingestion config" is preserved. This is acceptable because the one-to-one relationship matches user expectations and current usage patterns.
- If a genuine multi-profile-per-dataset use case emerges (e.g., a dataset that receives data from multiple structurally different sources on a recurring basis), this decision should be revisited. The config snapshot (alternative B) would provide data to evaluate whether such patterns actually occur.
