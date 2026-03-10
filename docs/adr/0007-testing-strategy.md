# ADR 0007: Testing Strategy

## Status

Accepted

## Context

TimeTiles needs a testing strategy that balances fast feedback during development with confidence that the system works end-to-end. The codebase includes pure business logic (coordinate parsing, date formatting, schema detection), services that depend on PostgreSQL and Payload CMS (import pipelines, geocoding, quota enforcement), and user-facing flows that span the full browser stack (explore page, import wizard). A single test approach cannot cover all three well.

The test infrastructure must also handle Vitest's concurrency model without mock contamination between files, provide database isolation for integration tests that use PostGIS, and avoid SonarCloud security warnings from hardcoded test credentials.

## Decision

TimeTiles uses **three test tiers**, each with its own runner configuration, isolation model, and trade-offs.

### Test Tiers

| Property    | Unit                           | Integration                    | E2E                       |
| ----------- | ------------------------------ | ------------------------------ | ------------------------- |
| Runner      | Vitest (`unit` project)        | Vitest (`integration` project) | Playwright                |
| Database    | None                           | Real PostgreSQL + PostGIS      | Real PostgreSQL + PostGIS |
| Payload CMS | Mocked                         | Real instance                  | Full Next.js server       |
| Browser     | None (node env)                | None (node env)                | Chromium (headless)       |
| Timeout     | 10s                            | 30s (hooks: 45s)               | 60s local, 120s CI        |
| Isolation   | `isolate: false` (shared fork) | `isolate: false` (shared fork) | Separate server + DB      |
| Speed       | Fast (~ms per test)            | Moderate (~s per test)         | Slow (~s per test)        |
| Location    | `tests/unit/`                  | `tests/integration/`           | `tests/e2e/`              |

### Test Runner: Vitest with Forks

Vitest is configured with `pool: "forks"` and up to 4 workers (`maxWorkers: 4`). Forks, not threads, because threads share memory within the same V8 isolate. With threads, `vi.mock()` calls in one file can leak into another file running in the same thread, causing unpredictable failures. Forks give each worker its own process with clean module state.

Within each fork, `isolate: false` means multiple test files share the module cache. This is a deliberate trade-off: faster execution (no per-file module reload) at the cost of requiring disciplined mock cleanup in `beforeEach`.

The one exception is `tests/unit/services/cache/**/*.test.ts`, which runs in a separate `unit-isolated` project with `isolate: true` because cache tests modify module-level singletons that cannot be safely shared.

Component tests (`tests/unit/components/**/*.test.tsx`) run in a `components` project with `jsdom` environment and `@vitejs/plugin-react`.

The full project configuration lives in `vitest.config.ts`:

```
projects:
  unit            — tests/unit/**  (excluding cache), node env, isolate: false
  unit-isolated   — tests/unit/services/cache/**, node env, isolate: true
  components      — tests/unit/components/**, jsdom env
  integration     — tests/integration/**, node env, isolate: false
```

### Database Isolation for Integration Tests

Integration tests use a template-and-clone strategy for fast, isolated databases:

1. **Global setup** (`tests/setup/integration/vitest-global-setup.ts`) runs once before all workers. It creates a template database (`timetiles_test_template`) with all migrations applied and converts tables to `UNLOGGED` for faster writes (no WAL overhead). If the template already exists with a valid schema, it is reused.

2. **Per-worker setup** (`tests/setup/integration/global-setup.ts`) runs in each fork's `beforeAll`. It clones the template to a worker-specific database using `CREATE DATABASE ... WITH TEMPLATE`, keyed by `process.pid`. Cloning takes roughly 2 seconds versus 30 seconds for running migrations from scratch.

3. **Per-test cleanup** uses `seedManager.truncate()` in `beforeEach` within each test file. Tests call `truncateCollections` with the specific collections they use rather than truncating everything.

4. **Worker databases are not dropped** after tests complete. They are reused on the next run if the schema is still valid, further reducing setup time.

The `createIntegrationTestEnvironment` function (in `tests/setup/integration/environment.ts`) is the main entry point for integration tests. It returns a `TestEnvironment` with a real Payload instance, a `SeedManager`, helper functions for truncation and counting, and a cleanup callback. The Payload instance is a cached singleton per worker -- it is never closed mid-run because subsequent test files in the same fork would get a dead connection pool.

### Mock Patterns

Unit tests mock external dependencies following three patterns:

**`vi.hoisted()` for mock variables.** Because `vi.mock()` is hoisted above imports, any mock variable referenced inside the factory must also be hoisted. This is the standard pattern for mocks that need per-test configuration:

```typescript
const { mockParseCoordinate } = vi.hoisted(() => ({ mockParseCoordinate: vi.fn() }));

vi.mock("@/lib/geospatial", () => ({ parseCoordinate: mockParseCoordinate }));
```

**`vi.mock()` with import-time side effects for shared mocks.** The logger mock (`tests/mocks/services/logger.ts`) calls `vi.mock("@/lib/logger", ...)` at import time. Test files opt in by importing the mock file:

```typescript
import "@/tests/mocks/services/logger";
```

This replaces the real Pino logger with silent `vi.fn()` stubs across all tests that import it, preventing log noise and enabling call verification via `mockLogger.logger.info`.

**`beforeEach` reset to prevent contamination.** Every test file that uses mocks calls `vi.clearAllMocks()` in `beforeEach` to reset call counts and return values. The integration setup goes further with `vi.restoreAllMocks()` in a global `afterEach` to undo `vi.spyOn` patches between files sharing a fork.

Other centralized mocks:

- `tests/mocks/external/next-navigation.ts` -- stubs `next/navigation` for server-side tests
- `tests/mocks/external/maplibre-gl.ts` -- stubs MapLibre GL for component tests in jsdom

### Test Credentials

All test passwords, API tokens, and emails are centralized in `tests/constants/test-credentials.ts`. This avoids SonarCloud flagging hardcoded strings as security issues.

Available constants:

| Constant                          | Contents                    |
| --------------------------------- | --------------------------- |
| `TEST_CREDENTIALS.basic.password` | Standard test passwords     |
| `TEST_CREDENTIALS.bearer.token`   | Bearer tokens for API tests |
| `TEST_CREDENTIALS.apiKey.key`     | API key values              |
| `TEST_TOKENS.webhook`             | Webhook tokens              |
| `TEST_SECRETS.payloadSecret`      | Payload CMS secret          |
| `TEST_EMAILS.admin`, `.user`      | Test user email addresses   |

Usage in tests:

```typescript
import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";

const user = await payload.create({
  collection: "users",
  data: { email: TEST_EMAILS.admin, password: TEST_CREDENTIALS.basic.strongPassword, role: "admin" },
});
```

Passwords and tokens must never be written as string literals in test files.

### Test Data Factories

The `tests/setup/factories.ts` module provides factory functions for building test objects: `createDateRange`, `createCoordinateGrid`, `createCSVContent`, `createRichText`, and Payload/job context mocks. Integration tests also use `withCatalog`, `withUsers`, and `withImportFile` builder functions from the environment module to set up test data with real database records.

### E2E Testing

E2E tests use Playwright with the following architecture:

**Global setup** (`tests/e2e/global-setup.ts`) creates a dedicated E2E database, runs migrations, seeds test data (users, catalogs, datasets, events, pages), builds the Next.js application if needed, and starts a production server and a job worker process.

**Custom fixtures** (`tests/e2e/fixtures/index.ts`) extend the base Playwright test with a `baseURL` fixture that points to the shared server. The base URL is computed from the git worktree to allow simultaneous test runs on different branches.

**Page Object Model.** Page objects in `tests/e2e/pages/` encapsulate locators and common interactions. For example, `ExplorePage` provides `map`, `catalogButtons`, `eventsCount` locators, and a `waitForMapLoad` method. Test files in `tests/e2e/flows/` import page objects and the custom fixtures:

```typescript
import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";
```

**Configuration** (`playwright.config.ts`):

- Tests within a file run sequentially (`fullyParallel: false`)
- 2 workers locally, 4 in CI
- Retries: 0 locally, 2 in CI
- Traces, screenshots, and video captured on failure
- Default browser: Chromium only (set `TEST_ALL_BROWSERS` for full matrix)

### Commands

| Command                       | What it does                                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| `make test-ai`                | Run all unit + integration tests with concise AI-friendly output |
| `make test-ai FILTER=pattern` | Run tests matching a file name pattern (24-120x faster)          |
| `make test-e2e`               | Run Playwright E2E tests with automatic database setup           |
| `make test-e2e FILTER="name"` | Run E2E tests matching a test name pattern                       |

`make test-ai` invokes `scripts/test-ai.ts`, which runs Vitest with `--reporter=json`, writes timestamped results to `.test-results/`, and prints a summary showing pass/fail counts, duration, and failed test names. Inspect failures with:

```bash
cat apps/web/.test-results/$(ls -t apps/web/.test-results/ | head -1) | jq '.testResults[] | select(.status=="failed") | .name'
```

## Consequences

- Unit tests run in under 10 seconds, giving fast feedback during development
- Integration tests require PostgreSQL but provide real database coverage including PostGIS operations
- The template-clone strategy keeps integration test startup under 5 seconds per worker
- `isolate: false` means tests must clean up after themselves; a forgotten mock can leak to the next file in the same fork
- UNLOGGED tables improve write speed but mean test databases do not survive a PostgreSQL crash (acceptable since they are disposable)
- E2E tests are slow (build + server startup + browser) but catch issues that unit and integration tests miss, such as client-server interaction bugs and UI rendering problems
- Centralized test credentials add a small import overhead but eliminate an entire class of SonarCloud findings
- The Page Object Model keeps E2E tests readable as the UI evolves -- locator changes are confined to page objects
