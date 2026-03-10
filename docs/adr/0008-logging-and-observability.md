# ADR 0008: Logging and Observability

## Status

Accepted

## Context

TimeTiles is a single-process application (see ADR 0001) that runs background import jobs, geocoding workflows, and user-facing API routes. Operators need visibility into errors, performance, and system health without the complexity of a full APM stack. The logging approach must work in both local development (human-readable output) and production containers (machine-parseable output).

## Decision

TimeTiles uses **Pino-based structured logging** as its primary observability mechanism, supplemented by a **health check endpoint** and **per-job progress tracking**. No external APM, distributed tracing, or metrics collection is used.

### Structured Logging with Pino

All application logging goes through a centralized module (`lib/logger.ts`) that provides four factory functions:

| Function                                         | Purpose                    | Context Fields                                 |
| ------------------------------------------------ | -------------------------- | ---------------------------------------------- |
| `createLogger(name)`                             | Module-scoped child logger | `module`                                       |
| `createRequestLogger(requestId, userId?)`        | Per-request child logger   | `requestId`, `userId`, `type: "request"`       |
| `createJobLogger(jobId, taskType)`               | Per-job child logger       | `jobId`, `taskType`, `type: "job"`             |
| `logPerformance(operation, duration, metadata?)` | Timed operation logging    | `type: "performance"`, `operation`, `duration` |

A dedicated error helper ensures consistent error serialization:

```typescript
logError(error, "Failed to geocode address", { address, provider });
// Output: { err: { message, stack }, context: "Failed to geocode address", address, provider }
```

The logger is used across 67 source files with over 400 call sites.

### Log Levels

The log level is determined by environment, with `LOG_LEVEL` env var as an override:

| Environment | Default Level | Rationale                                      |
| ----------- | ------------- | ---------------------------------------------- |
| Development | `debug`       | Full visibility during local work              |
| Production  | `info`        | Operational events without noise               |
| Test        | `silent`      | Clean test output; set `LOG_LEVEL` to override |

Pino's full level hierarchy is available: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

### Output Format

- **Development**: Pretty-printed with colors via `pino-pretty`. Timestamps formatted as `yyyy-mm-dd HH:MM:ss`. Metadata objects hidden to reduce noise.
- **Production**: Structured JSON with ISO timestamps. Each line is a self-contained JSON object suitable for log aggregation tools.

Both formats include `env` (NODE_ENV) in the base context of every log line.

### No console.log

The `no-console` ESLint rule is set to `error` in the shared config (`packages/eslint-config/base.js`) and enforced by oxlint (`.oxlintrc.json`). All logging must go through the logger module. The rule is relaxed only for CLI scripts and test files.

### Health Check as Observability

The `/api/health` endpoint (`lib/health.ts`) runs 9 checks in parallel and returns a JSON summary:

| Check                 | What It Verifies                                       |
| --------------------- | ------------------------------------------------------ |
| Environment variables | `PAYLOAD_SECRET` and `DATABASE_URL` are set            |
| Uploads directory     | Writable filesystem access                             |
| Geocoding service     | At least one enabled provider exists                   |
| Email configuration   | SMTP host configured (degraded in dev, error in prod)  |
| Payload CMS           | Can query the users collection                         |
| Migrations            | No pending migrations                                  |
| PostGIS               | Extension installed                                    |
| Database functions    | `cluster_events` and `calculate_event_histogram` exist |
| Database size         | Reports `pg_size_pretty` output                        |

Each check returns one of three statuses: `healthy`, `degraded`, or `error`. The endpoint returns HTTP 503 if any check reports `error`; HTTP 200 otherwise.

Docker polls this endpoint every 30 seconds:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost/api/health || exit 1
```

### Progress Tracking

Import jobs track per-stage progress through `ProgressTrackingService` (`lib/services/progress-tracking.ts`). This is not general observability but provides real-time visibility into the longest-running operations in the system.

The service tracks 7 processing stages with:

- Per-stage status (`pending`, `in_progress`, `completed`, `skipped`)
- Rows processed / total, batches processed / total
- Processing rate (rows/second)
- Estimated seconds remaining
- Weighted overall percentage based on stage time weights

Progress is stored in the import job's `progress` JSON field in the database. The frontend polls for updates. This is a read-modify-write pattern without locking, which is safe under the single-process assumption (see ADR 0001).

### What Is Intentionally Absent

| Capability                         | Examples              | Why It Is Not Used                                                                                     |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| Application Performance Monitoring | Datadog, New Relic    | Single-process app with low request volume does not justify the cost or complexity                     |
| Distributed tracing                | OpenTelemetry, Jaeger | No distributed architecture to trace across (see ADR 0001)                                             |
| Metrics collection                 | Prometheus, StatsD    | Health check endpoint covers the key signals; no dashboarding infrastructure exists                    |
| Error tracking service             | Sentry, Bugsnag       | Structured error logs with `logError` provide stack traces and context; searchable via log aggregation |
| Log aggregation                    | ELK, Loki             | Not bundled; JSON log output is compatible with any aggregator an operator chooses to deploy           |

These are deliberate trade-offs for simplicity at the current scale. The structured JSON output and consistent error logging make it straightforward to add any of these tools later without changing application code.

## Consequences

- All observability relies on log output and the health check endpoint -- no external dependencies required
- Operators can search logs by module, job ID, request ID, or error context using standard tools (`jq`, `grep`, or any log aggregator)
- Performance data is available in logs via `logPerformance` but there is no time-series storage or alerting
- Adding APM or tracing later requires only configuration changes (Pino transports, OpenTelemetry auto-instrumentation) rather than code rewrites
- The health check endpoint serves double duty as both a Docker liveness probe and an operator diagnostic tool
