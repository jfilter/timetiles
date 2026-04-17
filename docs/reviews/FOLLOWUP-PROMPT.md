# Follow-up session prompt — 2026-04 codebase review

Paste the block below into a new Claude Code session to continue the work.
Everything Claude needs to pick up context is in files on main or in
`~/.claude/projects/-Users-user-code-jf-timetiles/memory/`.

---

We shipped the critical + most high-priority fixes from a full-codebase
audit. Findings are at `docs/reviews/2026-04-16-codebase-review.md` (on main;
IDs like CRIT-07, HIGH-03). The recap of what's shipped vs. deferred is in
my memory at `project_review_2026_04_remaining.md` — read it first.

Goal this session: pick the next wave of items from the deferred list and
ship them properly. Work in a new worktree; never on main. One commit per
concern, not one mega-commit. Run `make check-ai` and `make test-ai` before
you claim done — and if tests fail, **debug the real cause, never hotfix**
(see `feedback_no_hotfixes`).

Please start by proposing which of these you'd tackle in this session and
why (pick 2-4 that make sense together):

1. **HIGH-08** — GIST spatial index on `events.location_*`. PostGIS
   cluster queries currently do full scans. Migration is straightforward
   but the table is large in prod, so use `CREATE INDEX CONCURRENTLY`
   and verify the Payload migration framework supports it (grep existing
   migrations for `CONCURRENTLY`).

2. **HIGH-09** — Paginate `/api/v1/data-sources` (currently `limit: 5000,
depth: 1, pagination: false`). API contract change; check the frontend
   consumers in `lib/hooks/` and `components/` first.

3. **HIGH-04 / HIGH-05** — Access-control query optimization.
   `getAccessibleCatalogIds` in `lib/services/access-control.ts:36-68`
   materializes the full public-catalog list per request. `ingestJobsAccess.read`
   uses `id.in` over the user's full file list and will hit Postgres's
   65535-parameter ceiling. Both want subquery-joins.

4. **HIGH-18** — Force-dynamic audit. 12 frontend routes have
   `dynamic = "force-dynamic"` unnecessarily (e.g. `/explore/list`, `/events`).
   Switch to `revalidate: 60-120` where appropriate, leave force-dynamic on
   truly session-dependent pages (`/login`, `/ingest`).

5. **HIGH-17** — Accessibility sweep. Near-zero `aria-*` usage across
   `apps/web/components`. Specifically the `<div role="slider">` in
   `components/filters/time-range-slider.tsx:162-167` has no Space/Enter
   handler. Pick the highest-value components, don't try to boil the ocean.

6. **MED-03** — HTTP security headers. No HSTS / `X-Content-Type-Options` /
   `Referrer-Policy` / `Permissions-Policy`. Add to `next.config.mjs` and
   extend middleware matcher to `/api`. Don't break existing admin UI.

For any item that needs a design decision (HIGH-15 rate-limit shared
store, MED-01 CSS sanitizer replacement, MED-04 password policy), produce
an ADR draft first — don't implement without alignment.

Constraints from my memory that still apply:

- Use worktrees in `.worktrees/`; instruct every sub-agent to stay there.
- No `git stash`. No background sub-agents.
- Never weaken a test assertion. If a test fails after a fix, the source
  is wrong or the contract legitimately changed — don't paper over it.
- State management: Zustand for client state, Context only for read-only
  server injection, React Query for server data.
- Named imports only, no default imports.
- `make check-ai FILES=...` expects paths relative to the package root.
- `URL_FETCH_TEST_TIMEOUT_MS` is an intentional `process.env` exception
  (see comments in `lib/config/env.ts` and `lib/jobs/handlers/url-fetch-job/index.ts`).
  Don't "centralize" it through `getEnv()`.

When done, update my memory `project_review_2026_04_remaining.md` to reflect
what shipped, and add a new entry under "Lessons captured" if you learned
anything non-obvious.
