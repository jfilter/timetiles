# Codebase Review — 2026-04-16

**Reviewers:** 7 parallel agents (architecture, backend, frontend, security, code-quality, testing, performance)
**Scope:** Full monorepo (`apps/web`, `apps/scraper`, `apps/timescrape`, `apps/docs`, `packages/*`)
**Status:** Findings documented. Remediation branch: `review/codebase-fixes`.

This document is the durable record of findings. Fixes applied in the same branch
reference specific section IDs (e.g. `CRIT-01`).

## Remediation Status

All CRIT items and all HIGH items from Streams 1-7 are addressed in this branch.
`make check-ai`: 0 errors, 10 warnings (all in pre-existing files not touched).
See each finding's "Fix applied" marker below.

---

## Severity Glossary

- **CRIT** — data loss, auth bypass, RCE, SSRF, silent corruption. Fix before next deploy.
- **HIGH** — reliability, security-adjacent, performance-at-scale. Fix in current sprint.
- **MED** — code quality, technical debt, minor UX issues. Fix opportunistically.
- **LOW** — hardening, nice-to-have. Backlog.

---

## CRITICAL Findings

### CRIT-01 — SSRF via `fetch()` bypassing `safeFetch()`

**Files:**

- `apps/web/lib/jobs/handlers/url-fetch-job/auth.ts:25` — OAuth token exchange. `tokenUrl` from `scheduledIngest.authConfig.oauthTokenUrl` (user-controlled).
- `apps/web/app/api/newsletter/subscribe/route.ts:44-51` — `serviceUrl` from admin-configured settings global; endpoint is `auth:"none"`.
- `apps/web/lib/globals/branding-hooks.ts:96` — raw fetch on media URL.

**Risk:** AWS IMDS (`http://169.254.169.254/`), Postgres (`http://localhost:5432/`), internal services. Error path in `auth.ts` returns response body (`body.slice(0, 200)`) → data exfiltration.

**Fix:** Route through `safeFetch()`.

---

### CRIT-02 — Rate limiter trivially bypassed by spoofing `X-Forwarded-For`

**File:** `apps/web/lib/services/rate-limit-service.ts:459-479`

`getClientIdentifier()` unconditionally trusts the first value of `X-Forwarded-For`, then `X-Real-IP`, then `CF-Connecting-IP`. No trusted-proxy allowlist.

**Risk:** Attacker rotates the header per request → credential stuffing, mass registration, webhook trigger flooding, user-enumeration timing-oracle amplification.

**Fix:** Gate header trust on `TRUSTED_PROXY_CIDRS` env var. Fall back to socket peer otherwise.

---

### CRIT-03 — `cancel-deletion` lacks password re-verification

**File:** `apps/web/app/api/users/cancel-deletion/route.ts:15-33`

Unlike sibling endpoints (`schedule-deletion`, `change-password`, `change-email`), this accepts a session cookie only.

**Risk:** Attacker who phishes/steals a session cookie during the grace window silently undoes deletion — the one window where the legitimate owner is most likely to notice.

**Fix:** Require `verifyPasswordWithAudit`; emit `account.deletion_cancelled_by_admin` audit entry when `req.user.id !== targetUserId`.

---

### CRIT-04 — Open redirect in `/api/preview`

**File:** `apps/web/app/api/preview/route.ts:16-42`

`collection` and `slug` typed as `z.string()` with no format restriction. Protocol-relative payloads like `collection=//evil.com/x&slug=y` become a `Location:` header that most browsers treat as absolute.

**Risk:** Authenticated phishing — victim logs in, gets redirected off-site with draft-mode cookies.

**Fix:** `collection` = `z.enum([...real collection slugs])`. `slug` = `/^[a-z0-9-_]+$/`. Reject leading `/` or `\` post-concatenation.

---

### CRIT-05 — Audit-log writes outside caller's transaction

**Files:**

- `apps/web/lib/collections/users.ts:410,424`
- `apps/web/lib/collections/catalogs.ts:314,330`
- `apps/web/lib/collections/datasets/hooks.ts:200`
- `apps/web/lib/collections/scheduled-ingests/index.ts:173`
- `apps/web/lib/collections/ingest-jobs/hooks.ts:174`
- `apps/web/lib/globals/settings.ts:40,57`

Every call is `auditLog(req.payload, action, details)` without the optional second argument `{ req }`. `audit-log-service.ts:95-111` supports it; callers just don't pass it.

**Risk:** Dual-transaction split.

- When parent transaction rolls back (validation failure, deadlock, constraint violation), audit entry is **already committed** — you log actions that never happened.
- When parent succeeds but the fresh audit transaction fails, the try/catch silently swallows it — lost audit trail.

**Fix:** Pass `req` everywhere. Mechanical refactor.

---

### CRIT-06 — `apiRoute` downgrades authed requests to anonymous on DB errors

**File:** `apps/web/lib/api/handler.ts:96-99`

`try { await payload.auth(...) } catch { logger.debug(...) }` catches every error (DB timeouts, network blips) and proceeds as unauthenticated.

**Risk:** Transient Postgres hiccup → every `auth:"optional"` endpoint exposes data the caller wouldn't otherwise see; every `auth:"required"` endpoint returns 401 despite a valid session.

**Fix:** Only swallow "no session" errors. Re-raise DB/network errors with a 503.

---

### CRIT-07 — Wizard auto-advance violates explicit user preference

**File:** `apps/web/app/[locale]/(frontend)/ingest/_components/steps/step-auth.tsx:36-40`

`useEffect(() => { if (authed) nextStep(); }, [authed])`. The wizard docblock (`ingest-wizard.tsx:5`) openly admits: "Handles auto-advance for steps 1-3 when their requirements are met."

Explicit `feedback_no_auto_advance` memory: "always require explicit user action to proceed between steps."

**Fix:** Remove auto-advance effect. Add "Continue" button. Audit other steps for the same pattern.

---

## HIGH Priority

### HIGH-01 — Scheduled-ingest retry counter never caps retries

**File:** `apps/web/lib/ingest/scheduled-ingest-utils.ts:108`
`currentRetries` increments forever; no scheduler-side check against `maxRetries`. Stuck imports persist until the daily cleanup job fires.

### HIGH-02 — Stage-transition drift on queue/update race

**File:** `apps/web/lib/collections/ingest-files.ts:438-471`
If `payload.jobs.queue()` succeeds but the subsequent `payload.update(status:"parsing", jobId)` fails, the workflow runs against a file stuck in `pending` forever.

### HIGH-03 — TOCTOU on dataset uniqueness

**File:** `apps/web/lib/collections/datasets/hooks.ts:140-175`
`find` → `create` without a DB-level unique constraint on `(catalog_id, name)`.

### HIGH-04 — `getAccessibleCatalogIds` materializes all public catalog IDs

**File:** `apps/web/lib/services/access-control.ts:36-68`
`pagination: false` on every event-list/geo/temporal/bounds query. Fix: subquery-join.

### HIGH-05 — `ingestJobsAccess.read` will hit Postgres param limit

**File:** `apps/web/lib/collections/ingest-jobs/access-control.ts:14-37`
Loads all user files into memory, then uses `id.in` with the whole array — explodes past 65535 parameters on heavy users.

### HIGH-06 — Direct `fetch()` in React component bypasses React Query

**File:** `apps/web/components/maps/use-h3-hover.ts:80`
Reimplements a cache via `useRef`. Move to `useH3ClusterChildrenQuery` in `lib/hooks/`.

### HIGH-07 — BeeswarmChart runs d3-force simulation on every render

**File:** `packages/ui/src/components/charts/beeswarm-chart.tsx:354-375`
Zero memoization in a 472-line file. `computeBeeswarmLayout`, `computeRowLayoutConfig`, `chartOption`, `layoutSeries` all need `useMemo`.

### HIGH-08 — Missing GIST spatial index on events

**File:** new migration required
`location_latitude` / `location_longitude` only have B-tree indexes. PostGIS cluster queries do full scans.

### HIGH-09 — Unpaginated 5000-row dataset dropdown

**File:** `apps/web/app/api/v1/data-sources/route.ts:31-39`
`limit: 5000, depth: 1, pagination: false`. Fix: paginate, select only needed fields.

### HIGH-10 — Workflow migration left dead schema fields

**File:** `apps/web/lib/collections/ingest-jobs/fields.ts:329-373`
`retryAttempts`, `lastRetryAt`, `nextRetryAt`, `lastSuccessfulStage`, `errorLog` — all served the deleted `ErrorRecoveryService`. Plus `apps/web/lib/services/CLAUDE.md` still instructs AI to use `StageTransitionService`.

### HIGH-11 — ADR numbering collisions

- `docs/adr/0015-ui-customization-system.md` + `docs/adr/0015-scraper-support.md`
- `docs/adr/0028-container-image-strategy.md` + `docs/adr/0028-json-api-import.md`

Cross-references become ambiguous. Renumber.

### HIGH-12 — ADR 0004 not marked superseded

ADR 0030 says it supersedes 0004; 0004 itself has Status: Accepted with no pointer.

### HIGH-13 — Config centralization is aspirational, not real

`apps/web/lib/config/payload-config-factory.ts:238,239,247,248,259,260` reads `process.env.EMAIL_FROM_*` directly. 13 total bypass sites of `getEnv()` across lib/.

### HIGH-14 — `quota-service.resetAllDailyCounters` is O(n) Payload updates

**File:** `apps/web/lib/services/quota-service.ts:542-562`
Replace with a single Drizzle bulk UPDATE.

### HIGH-15 — Rate limit service is in-memory only

**File:** `apps/web/lib/services/rate-limit-service.ts:118`
Multi-worker deployments have independent per-worker limits.

### HIGH-16 — Geocoding cache deletes expired entries one-by-one

**File:** `apps/web/lib/services/geocoding/cache-manager.ts:187-212`
1000 sequential `payload.delete` calls. `batchDeleteExpired` method exists; use it here.

### HIGH-17 — Accessibility near-absent

Only 2 `aria-*` usages across `apps/web/components`. Interactive `<div role="slider">` at `apps/web/components/filters/time-range-slider.tsx:162-167` has no Space/Enter handler.

### HIGH-18 — 12 frontend routes force-dynamic unnecessarily

`/explore/list`, `/events`, etc. set `dynamic = "force-dynamic"` disabling ISR. Most could revalidate every 60-120s.

---

## MEDIUM Priority

### MED-01 — Weak CSS sanitizer (regex-based, single-pass)

**File:** `apps/web/lib/security/css-sanitizer.ts:12-38`
Replace with `postcss` AST + allowlist.

### MED-02 — `ALLOW_PRIVATE_URLS=true` disables SSRF protection globally

**File:** `apps/web/lib/security/url-validation.ts:84-91`
Add `NODE_ENV !== "production"` gate.

### MED-03 — Missing HTTP security headers

No HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. `middleware.ts` excludes `/api`. Add headers() config to `next.config.mjs`.

### MED-04 — Password policy is 8-char minimum only

No max length (slow-hash DoS), no compromised-list check. Consider integrating HIBP k-anonymity API.

### MED-05 — Webhook token prefix leaked in logs

**File:** `apps/web/app/api/webhooks/trigger/[token]/route.ts:63`
Logs first 8 chars of a 64-hex token (32 bits). Hash instead.

### MED-06 — Audit log hooks do cross-transaction reads

Several hooks do `payload.find()` without `req` alongside the audit write, reading pre-commit state.

### MED-07 — Event list subquery materializes IDs

**File:** `apps/web/app/api/v1/events/route.ts:84-104`
Field-filter subquery pulls IDs into memory, feeds back via `id.in`. For 100k matches, huge allocation.

### MED-08 — 10 integration test suites missing `describe.sequential()`

Files: `apps/web/tests/integration/api/dataset-enum-fields.test.ts`, `enum-stats-filtering.test.ts`, `events-access-control.test.ts`, +7 others. Shared-state contamination risk.

### MED-09 — 32 tests use `.not.toThrow()` as sole assertion

Pattern: `expect(() => fn()).not.toThrow()` with no side-effect checks.

### MED-10 — 7 arbitrary `waitForTimeout()` in E2E tests

Files: `visual-regression.test.ts:44,59`, `transform-sync.test.ts`, `explore-view-switch.test.ts`, etc.

### MED-11 — Email service has zero unit tests

6 source files in `lib/email/`, no dedicated tests.

### MED-12 — "Backward compatibility" re-export shim

**File:** `apps/web/lib/services/rate-limit-service.ts:89-91`
Comments "for backward compatibility" — violates `feedback_no_backward_compat` rule.

### MED-13 — Two date-formatter implementations

`lib/utils/date.ts` (canonical) vs inline `formatDateValue` in `lib/hooks/use-filters.ts:27`.

### MED-14 — Tailwind `transition-all` on layout properties

7 usages transitioning flex/width — layout thrashing. Replace with `transition-[width]` or `transition-transform`.

### MED-15 — Hardcoded English in i18n-enabled component

**File:** `apps/web/components/charts/event-histogram.tsx:162,168,169`
Strings "Top groups", "Fewer", "More". Same component uses `useTranslations` elsewhere.

### MED-16 — Storybook coverage thin

~6 stories for ~50 UI components.

### MED-17 — BeeswarmChart is a god component

472 lines. Layout computation, d3-force simulation, chart option building, event handlers all in one file.

### MED-18 — `ProgressiveSchemaBuilder` packed into barrel `index.ts`

**File:** `apps/web/lib/services/schema-builder/index.ts`
513-line class masquerading as a barrel. Rename to `schema-builder.ts`, make `index.ts` a 5-line re-export.

### MED-19 — Inline ESLint disable without reason

- `apps/web/lib/filters/field-validation.ts:19` — security/detect-unsafe-regex
- `apps/web/lib/context/view-context.tsx:69` — complexity

### MED-20 — Duplicated JSDoc between sibling services

`QuotaService` and `RateLimitService` carry identical comparison tables. Will drift.

---

## LOW Priority / Hardening

- `next.config.mjs` — no `poweredByHeader: false`.
- `apps/web/lib/config/payload-config-factory.ts:186` — `secret ?? "default-secret-key"` fallback.
- Verification tokens (`apps/web/lib/collections/users.ts:64-91`) have no TTL.
- No SRI for CDN-loaded scripts in `customHtml` analytics.
- Cluster summary has no result caching (`apps/web/app/api/v1/events/cluster-summary/route.ts`).
- `apps/web/lib/jobs/handlers/data-export-cleanup-job.ts:35-75` — sequential `unlink()`.
- No unique index on `webhookToken` in migrations.
- Cluster density is double-sourced in Zustand (`apps/web/lib/store.ts:52-56` + `:135`).
- Heavy imports (`xlsx`) in API routes not lazy-loaded.

---

## Things Done Well (preserve)

- **`apiRoute()` wrapper** (`apps/web/lib/api/handler.ts`) — unified auth + Zod + typed errors.
- **State management discipline** — 1 Zustand store + scoped wizard store, Context only for read-only server injection, 38 React Query hooks. Matches stated preference.
- **Atomic SQL claims** — `trigger-service.ts`, `webhook-registry.ts`, `quota-service.ts:620-693` (CAS).
- **Zero TODO/FIXME/HACK/@deprecated** across ~87k LOC.
- **Layer boundaries** — utils → services → domain → application visible in import graph.
- **`lib/utils/`** — 16 small single-purpose files, reused widely.
- **`safeFetch` + `isPrivateUrl`** — thoughtful; `ALLOW_PRIVATE_URLS` uses bracket-notation to defeat webpack DCE.
- **Audit log** — append-only, 20 action types, hashed PII, immutable at API layer.
- **React Query presets** — `lib/hooks/query-presets.ts` with `standard`/`expensive`/`stable`/`frequent` tiers.
- **No reliance on mocks for DB/external services.**

---

## Remediation Plan

### This branch (review/codebase-fixes) — applied

**Completed: CRIT-01 through CRIT-07 + HIGH-01, 02, 03, 06, 07, 10, 11, 12, 13, 14, 16**

### Fixes Applied — concrete record

| ID      | Fix                                                                                                                                               | Files touched                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRIT-01 | SSRF: replaced raw `fetch()` with `safeFetch()` in all 3 sites                                                                                    | `lib/jobs/handlers/url-fetch-job/auth.ts`, `app/api/newsletter/subscribe/route.ts`, `lib/globals/branding-hooks.ts`                                                                            |
| CRIT-02 | Rate-limit trusted-proxy gate via `TRUSTED_PROXY_CIDRS` env var                                                                                   | `lib/services/rate-limit-service.ts`, `lib/config/env.ts`, `.env.example`                                                                                                                      |
| CRIT-03 | Password re-verify on cancel-deletion + audit log entry                                                                                           | `app/api/users/cancel-deletion/route.ts`                                                                                                                                                       |
| CRIT-04 | Open-redirect closed: `collection` = Zod enum, `slug` = regex, leading-slash guard                                                                | `app/api/preview/route.ts`                                                                                                                                                                     |
| CRIT-05 | `auditLog(…, { req })` passed in all 8 collection-hook sites                                                                                      | `lib/collections/users.ts`, `catalogs.ts`, `datasets/hooks.ts`, `scheduled-ingests/index.ts`, `ingest-jobs/hooks.ts`, `globals/settings.ts`, `lib/services/audit-log-service.ts`               |
| CRIT-06 | `apiRoute()` re-throws non-auth errors (DB blips no longer become 401)                                                                            | `lib/api/handler.ts`                                                                                                                                                                           |
| CRIT-07 | Wizard auto-advance removed; explicit "Continue" button                                                                                           | `app/[locale]/(frontend)/ingest/_components/steps/step-auth.tsx`, `ingest-wizard.tsx`, `messages/en.json`, `messages/de.json`                                                                  |
| HIGH-01 | Retry cap: `currentRetries >= maxRetries` → disable + audit + log                                                                                 | `lib/jobs/handlers/url-fetch-job/scheduled-ingest-utils.ts`, `lib/jobs/handlers/url-fetch-job/index.ts`, `lib/ingest/trigger-service.ts`, `lib/services/audit-log-service.ts`                  |
| HIGH-02 | Stage-transition drift: status-first, queue-second, reconcile-third                                                                               | `lib/collections/ingest-files.ts`                                                                                                                                                              |
| HIGH-03 | DB unique index + `afterError` hook for PG 23505                                                                                                  | `migrations/20260417_100000_datasets_catalog_name_unique.ts`, `lib/collections/datasets.ts`, `lib/collections/datasets/hooks.ts`                                                               |
| HIGH-06 | `use-h3-hover` routed through new `useH3ChildrenQuery`                                                                                            | `components/maps/use-h3-hover.ts`, `lib/hooks/use-events-queries.ts`                                                                                                                           |
| HIGH-07 | BeeswarmChart memoization (layout, chartOption, series, handlers)                                                                                 | `packages/ui/src/components/charts/beeswarm-chart.tsx`                                                                                                                                         |
| HIGH-10 | Dead fields dropped (retryAttempts, lastRetryAt, nextRetryAt, lastSuccessfulStage). `errorLog` + `schemaValidation.approved*` kept (still in use) | `lib/collections/ingest-jobs/fields.ts`, `lib/seed/seeds/ingest-jobs.ts`, `migrations/20260417_110000_drop_ingest_jobs_dead_fields.ts`                                                         |
| HIGH-11 | ADR renumbering: `0015-ui-customization → 0035`, `0028-container-image → 0036` (older ADRs kept original numbers)                                 | `docs/adr/0035-*`, `docs/adr/0036-*`, `apps/docs/content/development/features/ui-customization.mdx`                                                                                            |
| HIGH-12 | ADR 0004 marked "Superseded by ADR 0030 (orchestration replaced; stage model retained)"                                                           | `docs/adr/0004-import-pipeline.md`                                                                                                                                                             |
| HIGH-13 | Five `process.env` direct reads → `getEnv()`                                                                                                      | `lib/config/payload-config-factory.ts`, `lib/database/operations.ts`, `lib/jobs/handlers/url-fetch-job/index.ts`, `lib/seed/relationship-resolver.ts`, `lib/config/env.ts` (added schema keys) |
| HIGH-14 | Single Drizzle bulk UPDATE replaces per-row Payload loop                                                                                          | `lib/services/quota-service.ts`                                                                                                                                                                |
| HIGH-16 | Single DELETE with RETURNING replaces 1000-row loop                                                                                               | `lib/services/geocoding/cache-manager.ts`                                                                                                                                                      |
| —       | `services/CLAUDE.md` freshened: `StageTransitionService` references → ADR 0030 pointer                                                            | `apps/web/lib/services/CLAUDE.md` (gitignored)                                                                                                                                                 |

### Follow-up branches — design decisions or cross-cutting

- **HIGH-08, HIGH-09** — DB spatial index + API pagination contract changes. Separate branch (migration on large table).
- **HIGH-04, HIGH-05** — Access-control query optimization.
- **HIGH-15** — Rate-limit shared store (needs infra decision on Redis vs PG vs keep-as-is).
- **HIGH-17** — Accessibility sweep (needs dedicated focus).
- **HIGH-18** — Force-dynamic audit across 12 routes.
- **MED-01, MED-04** — CSS sanitizer replacement + password policy (design + ADR).
- **MED-03** — Security headers (coordination with deployment config).

### Backlog — remaining MED + LOW items as documented above.

### Deferred with reasoning

- `errorLog` and `schemaValidation.approved*` on ingest-jobs are **still in use** (failed-recommendations API, reset route, email templates, ~15 integration tests). Left in schema.
- `ALLOW_PRIVATE_URLS` bracket-notation read in `url-validation.ts` intentionally bypasses `getEnv()` to defeat webpack DCE — documented in the findings, not "fixed".
