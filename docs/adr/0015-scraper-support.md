# ADR 0015: Scraper Support

## Status

Proposed

## Context

TimeTiles ingests tabular data (CSV/Excel/ODS) from file uploads or scheduled URL fetches, but cannot scrape data from websites that do not expose clean tabular files. Many event sources publish data in HTML pages, APIs with pagination, or other formats that require custom extraction logic.

Users need a way to write scraper code that fetches and transforms web data into tabular format, run it in isolation from the main application, and feed results into the existing import pipeline. The design is inspired by [Morph](https://github.com/openaustralia/morph), an open-source scraper platform.

The key constraint is security: scraper code is user-authored and potentially untrusted, so it must execute in a sandboxed environment separate from the main application.

## Decision

### Architecture: Thin Runner + Payload Collections

The system is split into two components:

| Component              | Location       | Responsibility                                                                                                         |
| ---------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **TimeScrape Runner**  | `apps/scraper` | Execute user code in isolated Podman containers. Stateless, no database, no user management.                           |
| **Scraper Management** | `apps/web`     | Payload collections for repos/scrapers/runs, scheduling via existing job queue, UI, auth, import pipeline integration. |

This split exists because the only operation requiring isolation is executing untrusted code. Everything else (auth, scheduling, UI, storage, import pipeline) already exists in TimeTiles and should not be duplicated.

```
TimeTiles (apps/web)                    TimeScrape Runner (apps/scraper)
┌────────────────────────────┐         ┌──────────────────────────┐
│ Payload Collections:       │         │  POST /run               │
│  scraper-repos             │  API    │    ↓                     │
│  scrapers                  │  key    │  Podman container        │
│  scraper-runs              │────────→│  (rootless, hardened)    │
│                            │         │    ↓                     │
│ Payload Jobs:              │←────────│  Returns: CSV + logs     │
│  scraper-execution-job     │         └──────────────────────────┘
│  scraper-repo-sync-job     │
│                            │         Stateless. No DB. No users.
│ Import Pipeline:           │         Just an API key + Podman.
│  scraper CSV → import-file │
│  → existing pipeline       │
└────────────────────────────┘
```

### Feature Flag

A `enableScrapers` feature flag gates the system:

| Flag             | Guards                             | Effect When Disabled                      |
| ---------------- | ---------------------------------- | ----------------------------------------- |
| `enableScrapers` | `create` access on `scraper-repos` | Users cannot create new scraper repos     |
| (same)           | `scraper-execution-job` handler    | Job returns immediately without executing |

Source: `lib/collections/scraper-repos.ts` (access.create), `lib/jobs/handlers/scraper-execution-job.ts`

### Multi-Scraper Repos

A single Git repository or upload can define multiple scrapers via a `scrapers.yml` manifest at the repo root:

```yaml
scrapers:
  - name: "Berlin Events"
    slug: berlin-events
    runtime: python
    entrypoint: scrapers/berlin.py
    output: output/berlin.csv
    schedule: "0 6 * * *"
  - name: "Munich Events"
    slug: munich-events
    runtime: python
    entrypoint: scrapers/munich.py
    output: output/munich.csv
    schedule: "0 7 * * *"
defaults:
  runtime: python
  limits:
    timeout: 300
    memory: 512
```

Each scraper gets its own Payload record, independent schedule, and run history. The data model is: `scraper-repos (1) → scrapers (N) → scraper-runs (N)`.

One scraper produces exactly one CSV output. For multiple outputs, define multiple scrapers in the same repo.

Source: `lib/services/manifest-parser.ts`

### Source Types

Scraper repos support two source types:

| Type     | How code is provided                              | Storage                    |
| -------- | ------------------------------------------------- | -------------------------- |
| `git`    | `gitUrl` + `gitBranch` — cloned at execution time | Git hosting (GitHub, etc.) |
| `upload` | `code` field — `{filename: content}` JSON map     | Payload database           |

For `git` repos, the runner performs a shallow clone (`--depth 1`) with a configurable max size (default 50MB).

For `upload` repos, the JSON code map is passed directly to the runner's `/run` endpoint. Path traversal is prevented by rejecting filenames containing `..` or starting with `/`.

Source: `apps/scraper/src/services/code-prep.ts`

### Named Runtimes with Helper Libraries

Users select a named runtime rather than specifying language and library versions:

| Runtime  | Base             | Pre-installed libraries                           | Helper lib           |
| -------- | ---------------- | ------------------------------------------------- | -------------------- |
| `python` | Python 3.12-slim | requests, beautifulsoup4, lxml, pandas, cssselect | `timescrape`         |
| `node`   | Node.js 24-slim  | cheerio, axios                                    | `@timescrape/helper` |

No dependency installation at runtime. Scrapers can only use pre-installed libraries. No `pip install`, no `npm install`. This prevents supply chain attacks and simplifies execution.

All base images run as non-root user (UID 1000). Library versions are pinned per image release.

Source: `apps/scraper/images/python/Dockerfile`, `apps/scraper/images/node/Dockerfile`

**Helper libraries** make CSV output trivial:

```python
from timescrape import output
for event in scrape_events():
    output.write_row({"title": event["name"], "date": event["date"], "location": event["venue"]})
output.save()
```

The helper handles CSV formatting, headers (auto-detected from first row), and writing to the correct output path (`/output/{configured_filename}`).

Source: `apps/scraper/images/python/timescrape/output.py`, `apps/scraper/images/node/timescrape-helper/index.js`

### Container Isolation: Podman Rootless

Scraper containers run under Podman in rootless mode with defense-in-depth hardening:

| Layer                                  | What it does                                                        | Prevents                             |
| -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| Rootless Podman                        | No daemon, no socket, containers run as unprivileged user processes | Host root escalation                 |
| `--cap-drop=ALL`                       | Drop all Linux capabilities                                         | Kernel capability exploits           |
| `--security-opt=no-new-privileges`     | Prevent privilege escalation                                        | setuid/setgid escalation             |
| Custom seccomp profile                 | Restrict to ~100 allowed syscalls                                   | Kernel attack surface                |
| `--read-only` rootfs                   | Cannot modify container filesystem                                  | Persistence, malware                 |
| `--tmpfs /tmp:rw,noexec`               | Writable temp (64MB) but no binary execution                        | Downloaded malware execution         |
| `--pids-limit=256`                     | Limit process count                                                 | Fork bombs                           |
| `--memory`, `--cpus`, `--stop-timeout` | cgroup resource enforcement                                         | Resource exhaustion, crypto mining   |
| `--network=scraper-sandbox`            | Internet access only, no access to internal services                | Lateral movement to DB/web app       |
| `--userns=auto`                        | Container UID 0 maps to unprivileged host UID                       | Container escape to root             |
| `--dns=1.1.1.1`                        | External DNS only                                                   | DNS-based internal service discovery |

Podman rootless was chosen over Docker because it requires no daemon (eliminating the Docker socket attack vector), has zero CVEs in 2025, and provides rootless operation by default.

Source: `apps/scraper/src/security/container-config.ts`, `apps/scraper/src/security/seccomp-profile.json`

**Filesystem isolation:**

- `/scraper` — code directory, mounted **read-only**
- `/output` — output directory, mounted **read-write** (only writable location for CSV results)
- `/tmp` — tmpfs, writable but **noexec** (64MB limit)
- Everything else — read-only rootfs

### Communication: Runner API

TimeTiles calls the runner via HTTP with a shared API key (`SCRAPER_API_KEY`).

**Endpoints:**

| Method | Path               | Purpose                                                     |
| ------ | ------------------ | ----------------------------------------------------------- |
| `POST` | `/run`             | Execute a scraper — accepts code/config, returns CSV + logs |
| `POST` | `/stop/{run_id}`   | Kill a running container                                    |
| `GET`  | `/status/{run_id}` | Check if a run is still active                              |
| `GET`  | `/health`          | Health check (includes active run count)                    |

All endpoints except `/health` require `Authorization: Bearer {SCRAPER_API_KEY}`.

Source: `apps/scraper/src/api/run.ts`, `apps/scraper/src/index.ts`

**Request format (POST /run):**

```json
{
  "run_id": "uuid",
  "runtime": "python",
  "entrypoint": "scraper.py",
  "output_file": "data.csv",
  "code_url": "https://github.com/user/repo.git#main",
  "code": { "scraper.py": "import requests\n..." },
  "env": { "API_KEY": "..." },
  "limits": { "timeout_secs": 300, "memory_mb": 512 }
}
```

Either `code_url` (Git) or `code` (inline) must be provided. The response includes status, exit code, duration, stdout/stderr, and base64-encoded CSV output.

**Concurrency:** The runner tracks active runs in memory and rejects new requests when `SCRAPER_MAX_CONCURRENT` is reached (default 3).

Source: `apps/scraper/src/services/runner.ts`

### Output Validation

After each run, the runner validates the output file before returning it:

| Check          | Threshold                                    | Error                         |
| -------------- | -------------------------------------------- | ----------------------------- |
| File exists    | —                                            | Non-zero exit code if missing |
| File not empty | 0 bytes                                      | `INVALID_OUTPUT`              |
| Size limit     | `SCRAPER_MAX_OUTPUT_SIZE_MB` (default 100MB) | `INVALID_OUTPUT`              |
| Has header row | First non-empty line                         | `INVALID_OUTPUT`              |

Source: `apps/scraper/src/services/output-validator.ts`

### Payload Collections

Three new collections in `apps/web`:

#### `scraper-repos` — Source code repositories

Fields: `name`, `slug` (unique), `description`, `sourceType` (git/upload), `gitUrl`, `gitBranch`, `code` (JSON), `catalog` (relationship), `createdBy` (relationship to users).

Access: trust-level gated (level 3+ can create), users can only manage their own repos, admins see all.

Source: `lib/collections/scraper-repos.ts`

#### `scrapers` — Individual scraper definitions within a repo

Fields: `name`, `slug`, `repo` (relationship), `runtime` (python/node), `entrypoint`, `outputFile`, `schedule` (cron), `enabled`, `envVars` (JSON, encrypted), `timeoutSecs`, `memoryMb`, `targetDataset` (relationship), `autoImport`, `lastRunAt`, `lastRunStatus`, `statistics` (JSON).

Source: `lib/collections/scrapers.ts`

#### `scraper-runs` — Execution history

Fields: `scraper` (relationship), `status` (queued/running/success/failed/timeout), `triggeredBy` (schedule/manual/webhook), `startedAt`, `finishedAt`, `durationMs`, `exitCode`, `stdout`, `stderr`, `error`, `outputRows`, `outputBytes`, `resultFile` (relationship to import-files).

Source: `lib/collections/scraper-runs.ts`

### Scheduling

The existing `schedule-manager-job` (see ADR 0012) is extended to also check enabled scrapers with cron schedules. When a scraper is due, it queues a `scraper-execution-job` via the Payload job queue. The same concurrency guards (`lastRunStatus === "running"` check, stuck job cleanup) apply.

Source: `lib/jobs/handlers/schedule-manager-job.ts` (extended), `lib/jobs/handlers/scraper-execution-job.ts` (new)

### Manifest Sync

When a Git repo is registered or updated, a `scraper-repo-sync-job` runs:

1. Clone repo (shallow, `--depth 1`)
2. Read `scrapers.yml` from repo root
3. Parse and validate against Zod schema
4. Create, update, or delete scraper records to match manifest
5. Set up schedules for each enabled scraper

The `scrapers.yml` schema supports a `defaults` block that applies to all scrapers unless overridden.

Source: `lib/services/manifest-parser.ts`, `lib/jobs/handlers/scraper-repo-sync-job.ts`

### Import Pipeline Integration

When a scraper has `autoImport` enabled and a `targetDataset` configured:

1. Scraper runs successfully, returns CSV
2. `scraper-execution-job` decodes the base64 CSV content
3. Creates an `import-files` record from the CSV data
4. Queues `dataset-detection` job, entering the standard import pipeline (ADR 0004)
5. Pipeline runs: schema detection → validation → geocoding → event creation
6. Events appear on the map

This reuses the entire existing import pipeline with zero changes to pipeline code.

**Key existing files for pipeline integration:**

- `lib/collections/import-files.ts` — import file records
- `lib/jobs/handlers/dataset-detection-job.ts` — starts pipeline
- `lib/services/stage-transition.ts` — manages pipeline stages

### Trust-Level Gating

Access to scraper features is controlled by the existing `trustLevel` field on users (0–5):

| Trust Level | Permissions                               |
| ----------- | ----------------------------------------- |
| 0–2         | No scraper access                         |
| 3+          | Create repos, run scrapers (quotas apply) |
| admin       | Unlimited                                 |

Enforced via Payload access control hooks on the collections.

Source: `lib/collections/scraper-repos.ts` (access hooks), `lib/collections/users.ts` (`trustLevel` field)

### Quota Enforcement

Scraper quotas are enforced per user, based on trust level:

| Quota                    | Default (Level 3) | Default (Level 4) | Admin     |
| ------------------------ | ----------------- | ----------------- | --------- |
| Max scraper repos        | 3                 | 10                | Unlimited |
| Max scraper runs per day | 10                | 50                | Unlimited |
| Max concurrent runs      | 1                 | 3                 | Unlimited |

Quotas are checked in `beforeChange` hooks on collection create and in the `scraper-execution-job` before calling the runner. Exact thresholds are configurable via environment variables.

### Environment Variables

**apps/scraper (runner):**

| Variable                     | Default           | Purpose                              |
| ---------------------------- | ----------------- | ------------------------------------ |
| `SCRAPER_API_KEY`            | (required)        | Shared secret for API authentication |
| `SCRAPER_PORT`               | `4000`            | HTTP server port                     |
| `SCRAPER_MAX_CONCURRENT`     | `3`               | Max simultaneous container runs      |
| `SCRAPER_DEFAULT_TIMEOUT`    | `300`             | Default timeout in seconds           |
| `SCRAPER_DEFAULT_MEMORY`     | `512`             | Default memory limit in MB           |
| `SCRAPER_MAX_REPO_SIZE_MB`   | `50`              | Max Git repo size for clone          |
| `SCRAPER_MAX_OUTPUT_SIZE_MB` | `100`             | Max CSV output size                  |
| `SCRAPER_DATA_DIR`           | `/tmp/timescrape` | Temp directory for run workspaces    |

Source: `apps/scraper/src/config.ts`

**apps/web (additions):**

| Variable             | Default | Purpose                              |
| -------------------- | ------- | ------------------------------------ |
| `SCRAPER_RUNNER_URL` | —       | URL of the TimeScrape runner         |
| `SCRAPER_API_KEY`    | —       | Shared secret (same value as runner) |

### Network Architecture

```
┌─────────────────────────┐     ┌─────────────────────┐
│  timetiles-network      │     │  scraper-sandbox     │
│  (internal)             │     │  (internet access)   │
│                         │     │                      │
│  postgres, web app      │     │  scraper containers  │──→ internet
│                         │     │                      │
│  timescrape runner  ◄───│─────│  (spawns containers) │
│  (API server)       ────│─────│►                     │
└─────────────────────────┘     └──────────────────────┘
```

The TimeScrape runner server lives on the internal network (needs access to TimeTiles for communication). Scraper containers live on the `scraper-sandbox` network which has internet access but cannot reach internal services (PostgreSQL, web app, runner API).

## Consequences

- The runner (`apps/scraper`) is a separate deployment target. Operators who do not need scraping can skip it entirely. The main TimeTiles application functions without it — the feature flag ensures graceful degradation.
- Podman must be installed on the host running the runner. This is an additional infrastructure requirement not present in the base TimeTiles deployment.
- No dependency installation at runtime means users cannot use libraries beyond what is pre-installed. New runtimes or library additions require rebuilding base images. This is an intentional trade-off for security.
- The `scraper-sandbox` network must be configured to allow internet access but block access to internal services. Misconfiguration could allow scrapers to reach the database or web application.
- Scraper code is cloned from Git or uploaded as JSON. Large repositories are limited by a configurable max size (default 50MB, shallow clone). This prevents storage abuse but may exclude repos with large non-code assets.
- The shared API key between TimeTiles and the runner is a single point of compromise. If leaked, an attacker could execute arbitrary code in containers (within the hardening limits). The key should be rotated periodically and stored securely.
- Scraper output is limited to CSV format. Scrapers that need to produce other formats must convert to CSV. This simplifies the integration with the import pipeline but may be limiting for some use cases.
- The `schedule-manager-job` extension means scraper scheduling shares the same 60-second check interval as scheduled imports. High-frequency scraper schedules (more than once per minute) are not supported.
- The runner is stateless and tracks active runs in memory only. If the runner process restarts, running containers will be orphaned (Podman `--rm` flag ensures they clean up on exit, but the parent loses track). The `stuck job cleanup` pattern from ADR 0012 mitigates this on the TimeTiles side.
- CSV output is returned as base64-encoded content in the HTTP response. For very large outputs (approaching `SCRAPER_MAX_OUTPUT_SIZE_MB`), this may cause memory pressure on both the runner and the web app. A streaming or presigned-URL approach could be added later if needed.
