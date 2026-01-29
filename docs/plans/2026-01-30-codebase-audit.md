# Codebase Audit: Inconsistencies, Dead Code, and Quality Issues

**Date:** 2026-01-30
**Scope:** Full codebase audit of apps/web — API, UI, tests, dead code, and pipeline

---

## 1. Dead / Leftover Code

### 1.1 Unused Hook Exports

**Location:** `lib/hooks/use-filter-names.ts`
**Severity:** Medium

Three exported hooks are never imported anywhere:

- `useCatalogName` (line 69)
- `useDatasetNames` (line 82)
- `useFilterTitle` (line 95)

**Action:** Delete all three.

### 1.2 ActiveFilters Component Disabled Everywhere

**Locations:**
- `explore/_components/active-filters.tsx` — component exists, with `showCatalogDatasetFilters = false` hardcoded (line 59)
- `explore/_components/map-explorer.tsx:31` — commented-out import with TODO
- `explore/_components/list-explorer.tsx:26` — commented-out import with TODO
- `active-filters.tsx:34` — `EMPTY_HANDLER` constant for never-shown UI

**Severity:** Medium

The component was built, then disabled. Commented-out imports and TODOs remain.

**Action:** Remove the component file, commented-out imports, and all related TODOs. Git history preserves it if needed later.

---

## 2. Broken / Non-Functional

### 2.1 Forgot Password Link Goes Nowhere

**Location:** `components/auth/login-form.tsx:124`
**Severity:** High

Links to `/forgot-password` which does not exist as a route.

**Action:** Remove the link, or implement the forgot-password flow.

### 2.2 Import-Jobs Access Control Caps at 100 Files

**Location:** `lib/collections/import-jobs/access-control.ts:17-23`
**Severity:** High

```typescript
const userImportFiles = await payload.find({
  collection: "import-files",
  where: { user: { equals: user.id } },
  limit: 100,
  pagination: false,
  overrideAccess: true,
});
```

Users with more than 100 import files lose visibility into older jobs. The access control query silently truncates results.

**Action:** Remove the limit or paginate through all results. Consider denormalizing the user ID onto import-jobs to avoid the join entirely.

### 2.3 EventsList Has No Error Handling

**Location:** `explore/_components/events-list.tsx`
**Severity:** Medium

If the query errors, the component silently shows nothing. No error message, no retry option.

**Action:** Add error state handling consistent with other list components.

### 2.4 Chart Components Have No Error States

**Locations:**
- `AggregationBarChart`
- `EventHistogram`
- `ClusteredMap`

**Severity:** Medium

These components fetch data but have no visible error states when queries fail.

**Action:** Add error boundaries or inline error states to chart components.

### 2.5 Skipped Test With Indefinite TODO

**Location:** `tests/integration/api/temporal.test.ts:165`
**Severity:** Low

```typescript
it.skip("should include top datasets in metadata when implemented", async () => {
```

The feature isn't implemented. The test serves no purpose.

**Action:** Delete the skipped test. Implement it when the feature is built.

---

## 3. API / Backend Inconsistencies

### 3.1 Multiple Response Envelope Patterns

**Severity:** High

Each endpoint returns a different shape:

| Endpoint | Shape |
|----------|-------|
| `/api/v1/events` | `{ events, pagination }` |
| `/api/v1/events/bounds` | `{ bounds, count }` |
| `/api/v1/events/temporal` | `{ histogram, metadata }` |
| `/api/v1/events/stats` | `{ items, total, groupedBy }` |
| `/api/v1/events/geo` | GeoJSON `FeatureCollection` |

No standard envelope. Clients must implement multiple response parsers.

**Action:** Define a standard response envelope for non-GeoJSON endpoints (GeoJSON has its own spec). Consider `{ data, meta }` or similar.

### 3.2 Inconsistent Error Response Shapes

**Severity:** High

Three patterns exist:

- **Pattern A** (most endpoints): `{ error, code?, details? }` via `api-response.ts`
- **Pattern B** (account/wizard): `{ error }` with ad-hoc extra fields
- **Pattern C** (health): `{ error, message, stack, env }`

Stack traces are exposed inconsistently. Some include `code` for programmatic handling, others don't.

**Action:** Standardize on Pattern A. Never expose stack traces in production. Always include `code`.

### 3.3 Mixed Authentication Patterns

**Severity:** High

- Most endpoints: `withAuth()` / `withOptionalAuth()` middleware wrappers
- Account deletion: Manual `payload.auth()` inline
- Quotas endpoint: Manual `payload.auth()` inline

**Action:** Migrate all endpoints to use middleware wrappers. Remove inline auth checks.

### 3.4 Access Control Bypass in Some Endpoints

**Severity:** High

- Some endpoints use Payload's `overrideAccess: false` (auditable)
- Others (bounds API) bypass Payload and build manual WHERE clauses with `getAllAccessibleCatalogIds()`

**Action:** Audit all endpoints for consistent access control. Document which endpoints intentionally bypass Payload access control (e.g., for raw SQL performance) and ensure manual implementations match Payload's rules.

### 3.5 Services Mix Error Handling Styles

**Severity:** Medium

- `ErrorRecoveryService`, `StageTransitionService`: Return `Result<T>` objects with `{ success, error }`
- Job handlers: `throw` on errors
- Callers must handle both patterns

**Action:** Standardize on `Result<T>` for services. Job handlers should catch and return, not throw.

### 3.6 N+1 Queries in Access Control

**Severity:** Medium

**Import-jobs:** Runs a `payload.find()` query on every read to get user's import files, then filters jobs by those file IDs.

**Catalogs:** `findByID` on every update/delete just to check ownership.

**Action:** Denormalize user ID onto import-jobs. Short-circuit admin checks in catalog access control before querying.

### 3.7 Quota Type Naming Inconsistency

**Severity:** Medium

- Creation uses `USAGE_TYPES.IMPORT_JOBS_TODAY`
- Retry uses `QUOTA_TYPES.IMPORT_JOBS_PER_DAY`

These may refer to the same quota with different names, or they may be different quotas. Either way, it's confusing.

**Action:** Audit and unify quota type names. Single source of truth for each quota.

### 3.8 Three Different Field Mapping Representations

**Severity:** Low

1. `datasets.fieldMappingOverrides` — titlePath, descriptionPath, etc.
2. Schema detection output — `detectedFieldMappings`
3. Wizard configuration — titleField, descriptionField, dateField, etc.

No shared type or enum for field types. Conversion logic is duplicated.

**Action:** Define a single `FieldMapping` type and convert at boundaries.

### 3.9 Input Validation Inconsistencies

**Severity:** Medium

- Some endpoints validate immediately and return 400
- Others scatter individual checks through the handler
- Others rely on Payload access control returning null

No centralized validation layer.

**Action:** Consider a validation middleware or shared validation utility. At minimum, validate all inputs at the top of each handler.

### 3.10 Inconsistent Hook Patterns in Collections

**Severity:** Medium

- Some collections extract hooks to separate files, others inline them
- Hook responsibilities vary wildly (validation only vs. cascading updates + quota tracking)
- Some hooks do nested Payload queries that risk deadlocks (noted in comments)

**Action:** Extract all hooks to separate files. Document expected responsibilities per hook type. Add deadlock warnings where nested queries occur.

### 3.11 Module-Level State in Services

**Severity:** Medium

**Location:** `StageTransitionService` has a static `transitioningJobs = new Set<string>()`

In serverless environments, this won't work — different instances have different Sets. Cleanup mechanism exists (`clearTransitionLocks()`) but it's unclear when it's called.

**Action:** Move lock state to the database or Redis if serverless deployment is expected. Document the limitation if single-instance is assumed.

### 3.12 Unused/Unpopulated Collection Fields

**Severity:** Low

**Events:**
- `locationName` — never populated by any job handler or API
- `importBatch` — defined but not set by create-events-batch-job
- `schemaVersionNumber` — defined but never set

**Datasets:**
- `fieldMetadata` — marked readOnly, never populated

**Action:** Audit each field. Remove if truly unused. Document if populated by external processes.

---

## 4. UI Inconsistencies

### 4.1 Five Different Loading Patterns

**Severity:** Medium

| Component | Pattern |
|-----------|---------|
| EventsList | Inline "Loading events..." text |
| EventsListPaginated | `EventsListSkeleton` with animate-pulse cards |
| LoginForm / RegisterForm | Button text change + disabled state |
| ImportUpload | Emoji spinners + custom progress bars |
| MapExplorer | `isInitialLoad` vs `isUpdating` states |

**Action:** Standardize on skeleton loading for content areas, button state changes for actions. Create shared loading components.

### 4.2 No Consistent Error Display

**Severity:** Medium

- Login/Register: Inline `<p>` with red text
- EventDetailModal: Dedicated `EventDetailError` component
- ImportUpload: Custom `ErrorAlert` component
- EventsList: No error handling at all

No toast notifications anywhere.

**Action:** Adopt a single error display strategy. Consider toast for transient errors, inline for form validation, error boundary for unexpected failures.

### 4.3 Mixed Raw HTML and shadcn Components

**Severity:** Medium

Import dialog uses raw `<input>`, `<button>`, `<div>` while explore pages use shadcn `Card`, `Button`, etc.

**Action:** Replace raw HTML form elements with shadcn equivalents across import pages.

### 4.4 Inconsistent Form Status Enums

**Severity:** Low

- LoginForm: `"idle" | "loading" | "error"`
- RegisterForm: `"idle" | "loading" | "success" | "error"`

**Action:** Create a shared `FormStatus` type used by all forms.

### 4.5 Inconsistent Spacing and Max-Width

**Severity:** Low

Similar pages use different padding (`p-4`, `p-6`, `px-4 py-8`) and max-widths (`max-w-2xl`, `max-w-4xl`). `PageLayout` accepts a `maxWidth` prop but usage varies.

**Action:** Define standard page layouts (narrow, medium, wide) and use consistently.

### 4.6 Inconsistent Responsive Behavior

**Severity:** Low

- MapExplorer/ListExplorer: Use `hidden md:block` / `md:hidden`
- EventsPage: No responsive layout consideration
- MobileFilterSheet: Uses `md:hidden` for FAB

**Action:** Document breakpoint strategy. Audit all pages for mobile behavior.

---

## 5. Test Quality Issues

### 5.1 Duplicate Test Coverage

**Severity:** Medium

`tests/integration/services/quota-basic.test.ts` (100 lines) and `tests/integration/services/quota.test.ts` (466 lines) test the same quota functionality.

**Action:** Delete `quota-basic.test.ts`. The comprehensive version covers all cases.

### 5.2 Weak Component Test Assertions

**Severity:** Medium

Bar chart tests (`catalog-bar-chart.test.tsx`, `dataset-bar-chart.test.tsx`) only check:
```typescript
expect(bars.length).toBeGreaterThan(0);
```

No verification of actual data, labels, or counts.

**Action:** Assert on specific expected values based on mock data.

### 5.3 Console.log Debugging in Tests

**Severity:** Low

`quota-basic.test.ts` has `console.log("First check:", check1)` debug statements.

**Action:** Remove debug logging from tests.

### 5.4 Inconsistent Mock Patterns

**Severity:** Low

- Some tests use `vi.mock()` at module level
- Others use `vi.doMock()` / `vi.doUnmock()` in nested describes
- Mix of `mockImplementation` and `mockReturnValue`
- Inconsistent use of `describe.sequential()`

**Action:** Document preferred mock patterns. Use `vi.mock()` at module level as default; `vi.doMock()` only when different values needed per describe block.

### 5.5 Trivial ID Sanitization Tests

**Severity:** Low

**Location:** `tests/unit/services/id-generation.test.ts:72-77`

Tests verify that input equals output (no sanitization occurs). If sanitization logic broke, these tests would still pass.

**Action:** Add test cases with inputs that actually require sanitization and verify the output differs from input.

---

## Priority Summary

### Must Fix (High Severity)
1. Forgot-password link to non-existent route
2. Import-jobs 100-file access control cap
3. Standardize API response/error format
4. Migrate all endpoints to auth middleware wrappers
5. Audit access control bypass endpoints

### Should Fix (Medium Severity)
6. Remove dead code (unused hooks, ActiveFilters)
7. Add error states to EventsList and chart components
8. Standardize service error handling (Result pattern)
9. Fix N+1 queries in access control
10. Unify quota type names
11. Delete duplicate quota test file
12. Strengthen weak component test assertions
13. Standardize loading/error UI patterns
14. Replace raw HTML with shadcn in import pages
15. Address module-level state in services

### Nice to Have (Low Severity)
16. Remove skipped test
17. Remove console.log from tests
18. Unify field mapping types
19. Standardize form status enums
20. Consistent spacing/max-width
21. Document mock patterns for tests
22. Clean up unused collection fields
23. Fix trivial sanitization tests
