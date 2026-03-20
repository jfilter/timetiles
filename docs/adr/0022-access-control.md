# ADR 0022: Access Control Model

## Status

Accepted

## Context

TimeTiles is a multi-tenant platform where users create catalogs, import datasets, and share events publicly or privately. The access control model must answer three questions for every operation: Does the user have the right role? Do they own the resource (or is it public)? Is the operation currently enabled? These checks must be consistent whether the request arrives through Payload's REST API, the admin dashboard, or a custom Next.js API route -- and they must scale without adding a per-document database lookup to every query.

ADR 0002 (Security Model) covers authentication, roles, trust levels, rate limiting, and quotas. This ADR covers the access control implementation: how those roles and trust levels translate into collection-level and field-level permissions, how ownership is tracked and queried efficiently, and how custom API routes interact with Payload's access control layer.

## Decision

### Payload Access Control Primitives

Payload CMS access control functions run on every collection operation (read, create, update, delete, readVersions). Each function receives the request context and returns one of three shapes:

| Return                         | Meaning                            | When Used                            |
| ------------------------------ | ---------------------------------- | ------------------------------------ |
| `true`                         | Allow unconditionally              | Admins reading any collection        |
| `false`                        | Deny unconditionally               | Unauthenticated delete attempts      |
| `{ field: { equals: value } }` | Append a WHERE clause to the query | Users reading only their own records |

The WHERE-clause return is the key scalability mechanism. Instead of loading every document and checking ownership in application code, Payload appends the constraint to the SQL query. This means a user listing events sees only their permitted subset without any additional round-trips.

### Role-Based Access

Three roles control coarse-grained permissions. The helpers in `shared-fields.ts` centralize role checks:

| Helper               | Logic                                             | Used By                                        |
| -------------------- | ------------------------------------------------- | ---------------------------------------------- |
| `isPrivileged(user)` | `role === "admin" OR role === "editor"`           | Most collection access functions               |
| `isAdmin`            | `role === "admin"`                                | User deletion, settings update, audit log read |
| `isEditorOrAdmin`    | Same as `isPrivileged`, typed as Payload `Access` | Delete and readVersions on most collections    |
| `isAuthenticated`    | `Boolean(user)`                                   | Catalog and dataset creation                   |

Editors and admins bypass all ownership checks (they receive `true` from access functions). Regular users receive WHERE-clause filters.

### Ownership-Based Access

Resources form a hierarchy: Catalog > Dataset > Event. Ownership flows from catalogs downward:

```
Catalog (createdBy: userId)
  -> Dataset (catalog: catalogId)
    -> Event (dataset: datasetId)
```

Two reusable factories generate ownership access functions:

**`createOwnershipAccess(collection, ownerField)`** -- For collections where the owner is stored directly on the document (e.g., catalogs with `createdBy`). Returns a WHERE clause filtering by the owner field.

**`createPublicOwnershipAccess(ownerField)`** -- For collections with both public visibility and ownership (Sites, Views). Returns five access functions (read, create, update, delete, readVersions) where read allows public OR owned documents, and mutations require ownership or privilege.

### Denormalized Access Fields

Events and datasets do not have a direct `createdBy` field pointing to the user. Their access depends on the parent catalog's owner and visibility. A naive implementation would require joining through the hierarchy on every query. Instead, denormalized fields are stored directly on child documents:

| Field              | Stored On               | Source                                  | Purpose                               |
| ------------------ | ----------------------- | --------------------------------------- | ------------------------------------- |
| `catalogCreatorId` | datasets                | `catalog.createdBy`                     | Owner check without catalog join      |
| `catalogIsPublic`  | datasets                | `catalog.isPublic`                      | Visibility check without catalog join |
| `datasetIsPublic`  | events, dataset-schemas | `dataset.isPublic AND catalog.isPublic` | Combined visibility flag              |
| `catalogOwnerId`   | events, dataset-schemas | `catalog.createdBy`                     | Owner check without catalog join      |

All four fields are indexed and hidden from the admin UI.

**Why denormalize instead of join:** Payload access functions return WHERE clauses, not arbitrary SQL. They cannot express cross-table joins. By storing the catalog owner ID and visibility flags directly on the child documents, access functions return simple equality checks:

```typescript
// Events read access -- no joins, no subqueries
read: ({ req: { user } }) => {
  if (isPrivileged(user)) return true;
  if (user) {
    return { or: [{ datasetIsPublic: { equals: true } }, { catalogOwnerId: { equals: user.id } }] };
  }
  return { datasetIsPublic: { equals: true } };
};
```

**Keeping denormalized fields in sync:** When a catalog's `createdBy` or `isPublic` changes, an `afterChange` hook on the catalogs collection cascades the update to all child datasets, events, and dataset-schemas. The cascade is batched to minimize database calls (at most 4 UPDATE statements instead of 2N). When a dataset's `isPublic` changes, a similar hook syncs to its events.

**Visibility invariant:** A dataset in a public catalog can be public or private. A dataset in a private catalog is always effectively private (`datasetIsPublic = false`), regardless of its own `isPublic` flag. The `validatePublicCatalogDataset` hook enforces that datasets in public catalogs cannot be set to private when the feature flag `allowPrivateImports` is disabled.

### Datasets Access Control

Datasets add a layer between catalogs and events. Their access control checks both dataset-level and catalog-level visibility:

| Operation | Rule                                                                   |
| --------- | ---------------------------------------------------------------------- |
| Read      | Public dataset in public catalog, OR user owns the catalog             |
| Create    | Authenticated + feature flag enabled; hook validates catalog ownership |
| Update    | Catalog owner or privileged                                            |
| Delete    | Editor or admin only                                                   |

The `beforeChange` hook on datasets validates that non-privileged users can only create datasets in catalogs they own. This is a hook-level check rather than an access-function check because it requires fetching the catalog to compare ownership -- something the access function's WHERE-clause return cannot express.

### Import Jobs Access Control

Import jobs use indirect ownership: an import job belongs to an import file, which belongs to a user. The read access function queries the user's import files first, then returns a WHERE clause filtering by `importFile IN (user's file IDs)`. Update access performs a per-document ownership check by following the import file relationship.

### Feature Flag Gating

Several `create` access functions check feature flags before allowing the operation. Feature flags are a global on/off switch that applies to all users, including admins:

| Flag                     | Gates                            |
| ------------------------ | -------------------------------- |
| `enableDatasetCreation`  | Dataset creation                 |
| `enableEventCreation`    | Event creation (via API)         |
| `enableImportCreation`   | Import job creation              |
| `enableScheduledImports` | Scheduled import creation        |
| `enableScrapers`         | Scraper repo creation            |
| `allowPrivateImports`    | Private catalog/dataset creation |

Feature flags use a fail-closed default: if the database is unavailable, all flags return `false`.

### Trust Level Gating

Beyond quota enforcement (covered in ADR 0002), trust levels gate access to specific features:

| Feature               | Minimum Trust Level | Reference                        |
| --------------------- | ------------------- | -------------------------------- |
| Scraper repo creation | 3 (Trusted)         | `scraper-repos.ts` access.create |

Trust level checks in access functions inspect `user.trustLevel` directly. This is distinct from quota enforcement, which uses the QuotaService.

### Admin-Only Field Updates

Certain fields allow read access to authenticated users but restrict updates to admins. This uses Payload's field-level `access` block:

| Field          | Collection | Read              | Update     |
| -------------- | ---------- | ----------------- | ---------- |
| `role`         | users      | All authenticated | Admin only |
| `trustLevel`   | users      | All authenticated | Admin only |
| `quotas`       | users      | All authenticated | Admin only |
| `customQuotas` | users      | Admin only        | Admin only |

The `beforeChange` hook on users provides defense-in-depth: self-registration requests (identified by `req.payloadAPI === "REST"` with no authenticated user) have their `role` forced to `"user"` and `trustLevel` forced to `BASIC`, regardless of what was submitted.

### Global Access Control

Payload globals (Branding, Footer, MainMenu, Settings) use a simpler model:

| Global                     | Read                         | Update          |
| -------------------------- | ---------------------------- | --------------- |
| Branding, Footer, MainMenu | Anyone (including anonymous) | Editor or admin |
| Settings                   | Anyone (including anonymous) | Admin only      |

Settings uses admin-only update because it contains feature flags and sensitive configuration (newsletter auth headers).

### Immutable Collections

The audit log collection denies all mutations through the API:

```typescript
access: {
  read: ({ req: { user } }) => user?.role === "admin",
  create: () => false,
  update: () => false,
  delete: () => false,
}
```

Records are created only through the internal `AuditLogService` using `overrideAccess: true`.

### Custom API Routes and Access Control

Custom API routes (under `app/api/`) use the `apiRoute()` handler, which provides four auth modes:

| Mode         | Behavior                                     |
| ------------ | -------------------------------------------- |
| `"required"` | 401 if not authenticated                     |
| `"optional"` | Authenticate if possible, proceed either way |
| `"admin"`    | 401 if not authenticated, 403 if not admin   |
| `"none"`     | Skip authentication entirely                 |

Public data endpoints (events list, geo queries, temporal data, bounds, stats) use `auth: "optional"` because anonymous users can view public data. Admin endpoints (schedule service, job runner, geocoding test) use `auth: "admin"`.

**Two approaches to enforcing collection access in custom routes:**

1. **Delegate to Payload** -- Pass `user` and set `overrideAccess: false` when calling Payload's find/findByID. Payload applies the collection's access functions automatically. Used by the data-sources endpoint and event list endpoint.

2. **Pre-filter with AccessControlService** -- For SQL-based queries that bypass Payload's ORM (geo clustering, histograms, bounds), the route calls `getAllAccessibleCatalogIds(payload, user)` to get the list of catalog IDs the user can access, then passes those IDs into the SQL query's WHERE clause. This replicates the same public-or-owned logic but at the catalog level rather than the event level.

The canonical filter pipeline (`resolveEventQueryContext`) combines both: it resolves accessible catalog IDs, builds a canonical filter object, and the SQL adapter applies catalog-level filtering to every geospatial query.

## Consequences

- **Zero-query access control** -- Denormalized fields eliminate joins in the hot path. Every access check resolves to a simple indexed WHERE clause.
- **Cascade cost on catalog changes** -- Updating a catalog's owner or visibility triggers bulk updates across datasets, events, and dataset-schemas. This is acceptable because catalog metadata changes are infrequent compared to reads.
- **Consistency between Payload and SQL** -- Two parallel access control paths exist: Payload's access functions (for ORM queries) and the AccessControlService (for raw SQL). Both derive from the same ownership/visibility model but must be kept in sync manually.
- **Feature flags are global** -- There is no per-user or per-role feature flag override. A disabled feature is disabled for everyone.
- **Hook-level validation supplements access functions** -- Some business rules (e.g., "users can only create datasets in their own catalogs") cannot be expressed as WHERE-clause returns and live in `beforeChange` hooks instead. This means the access function allows the operation and the hook may reject it, which is a two-step check rather than a single gate.
