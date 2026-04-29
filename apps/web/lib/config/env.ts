/**
 * Centralized environment variable validation using Zod.
 *
 * Provides type-safe access to all environment variables with fail-fast
 * validation at startup. Follows the lazy singleton pattern from
 * {@link apps/timescrape/src/config.ts}.
 *
 * All `process.env` reads in `apps/web/lib/` must go through `getEnv()` to
 * ensure validation and central documentation. The single known exception is
 * `ALLOW_PRIVATE_URLS` in `lib/security/url-validation.ts`, which is read via
 * bracket notation (`process.env["ALLOW_PRIVATE_URLS"]`) to prevent webpack
 * from inlining the value at build time — see that file for details.
 *
 * Flag-style variables that the runtime compares to the string `"true"` (e.g.
 * `CI`, `GITHUB_ACTIONS`, `VITEST`) are intentionally kept as `z.string()` to
 * preserve the `=== "true"` comparison semantics callers already rely on.
 *
 * @module
 * @category Config
 */
import { z } from "zod";

/**
 * Zod schema for runtime environment variables.
 *
 * All variables have defaults except DATABASE_URL and PAYLOAD_SECRET
 * which are required at runtime.
 * During build phase, a relaxed schema is used instead.
 */
const baseSchema = {
  // === Infrastructure ===
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
  DEFAULT_LOCALE: z.enum(["en", "de"]).default("en"),
  // Surface-level deployment label, independent of NODE_ENV. Drives the
  // EnvironmentBanner so visitors can tell staging/preview apart from prod.
  // Read server-side only — kept out of the NEXT_PUBLIC_* namespace so the
  // same Docker image can run as either staging or prod without rebuilding.
  DEPLOYMENT_ENVIRONMENT: z.enum(["production", "staging", "preview", "development"]).default("production"),

  // === Logging ===
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).optional(),
  LOG_FILE: z.string().optional(),

  // === File paths ===
  UPLOAD_DIR: z.string().default("uploads"),
  UPLOAD_TEMP_DIR: z.string().default("/tmp"),
  DATA_EXPORT_DIR: z.string().default(".exports"),

  // === Email ===
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().default(587),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().default("noreply@timetiles.io"),
  EMAIL_FROM_NAME: z.string().default("TimeTiles"),

  // === Scraper integration ===
  SCRAPER_RUNNER_URL: z.string().optional(),
  SCRAPER_API_KEY: z.string().optional(),

  // === Rate limiting ===
  // Kept as a string so unknown values can fall back to memory at runtime
  // with a prominent warning instead of failing startup validation.
  RATE_LIMIT_BACKEND: z.string().default("memory"),
  // Worker-count hints used only to fail-loud when the in-memory rate limit
  // backend is paired with a multi-worker deployment. Optional; default 1.
  WEB_CONCURRENCY: z.coerce.number().int().positive().default(1),
  CLUSTER_WORKERS: z.coerce.number().int().positive().default(1),

  // === Security ===
  // Enables resolved-IP SSRF checks outside production. Production always
  // enforces DNS resolution validation even when this flag is false.
  SSRF_DNS_CHECK: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // HIBP compromised-password check for new passwords. Enabled by default;
  // set to "false" for offline dev or to disable the outbound HIBP call.
  PASSWORD_HIBP_CHECK: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),

  // Comma-separated CIDR allowlist for trusted reverse proxies. When set, the
  // rate limiter will strip IPs inside these ranges from the right end of
  // `X-Forwarded-For` before picking the client address. Empty by default (no
  // trust); in production the rate limiter ignores forwarded IP headers until
  // this allowlist is configured.
  // Example: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
  TRUSTED_PROXY_CIDRS: z.string().default(""),

  // === Build/CI flags ===
  // These are string-typed (rather than coerced booleans) because callers
  // compare explicitly against the string "true". This matches the raw
  // semantics of the environment variables as set by CI providers.
  NEXT_PHASE: z.string().optional(),
  SKIP_DB_CHECK: z.string().optional(),
  CI: z.string().optional(),
  GITHUB_ACTIONS: z.string().optional(),
  VITEST: z.string().optional(),

  // NOTE: URL_FETCH_TEST_TIMEOUT_MS is intentionally NOT in the schema.
  // It is read directly via process.env in lib/jobs/handlers/url-fetch-job/index.ts
  // because tests mutate it between assertions and getEnv() is memoized —
  // routing it through getEnv() would require every test to call resetEnv(),
  // which is fragile under vitest's `isolate: false` forks. Documented here so
  // future refactors don't "centralize" it and break the timeout tests.
};

/**
 * Runtime schema — required fields enforced.
 */
const runtimeEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PAYLOAD_SECRET: z.string().min(1, "PAYLOAD_SECRET is required"),
  NEXT_PUBLIC_PAYLOAD_URL: z.string().default("http://localhost:3000"),
  ...baseSchema,
});

/**
 * Build-phase schema — all fields optional with dummy defaults.
 * Used during `next build` when DATABASE_URL and PAYLOAD_SECRET are unavailable.
 */
const buildEnvSchema = z.object({
  DATABASE_URL: z.string().default(""),
  PAYLOAD_SECRET: z.string().default("dummy-build-secret"),
  NEXT_PUBLIC_PAYLOAD_URL: z.string().default("http://localhost:3000"),
  ...baseSchema,
});

export type Env = z.infer<typeof runtimeEnvSchema>;

const shouldRelaxSchema = (): boolean =>
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_DB_CHECK === "true" ||
  process.env.VITEST === "true";

let _env: Env | null = null;

/**
 * Parse and validate all environment variables.
 *
 * Uses a relaxed schema during build phase (no required fields).
 * Caches the result for subsequent calls.
 *
 * @throws {z.ZodError} If required environment variables are missing or invalid at runtime
 */
export const getEnv = (): Env => {
  if (_env) return _env;

  const schema = shouldRelaxSchema() ? buildEnvSchema : runtimeEnvSchema;
  _env = schema.parse(process.env);
  return _env;
};

/**
 * Reset the cached environment (for testing).
 */
export const resetEnv = (): void => {
  _env = null;
};
