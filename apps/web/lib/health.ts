/**
 * Provides a comprehensive health check service for the application.
 *
 * This module defines a set of functions to check the status of various critical
 * components of the application infrastructure, including:
 * - Required environment variables.
 * - Writable access to the uploads directory.
 * - Connectivity and configuration of the geocoding service.
 * - General accessibility of the Payload CMS API.
 * - Database migration status.
 * - Availability of the PostGIS extension in the database.
 *
 * The main export, `runHealthChecks`, orchestrates these checks and returns a
 * summary of the system's overall health.
 *
 * @module
 */
import fs from "node:fs/promises";
import path from "node:path";

import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { getPayload } from "payload";

import config from "../payload.config";
import { getEnv } from "./config/env";
import { COLLECTION_NAMES } from "./constants/ingest-constants";
import { createLogger } from "./logger";

const logger = createLogger("health-checks");

export interface HealthCheckResult {
  status: "healthy" | "error" | "degraded";
  message: string;
}

const getEnvValue = (key: string): string | undefined => {
  // Enhanced safe property access to avoid object injection
  if (
    typeof key === "string" &&
    key.length > 0 &&
    !Object.hasOwn(Object.prototype, key) &&
    Object.hasOwn(process.env, key)
  ) {
    return process.env[key];
  }
  return undefined;
};

// eslint-disable-next-line @typescript-eslint/require-await -- Async for interface compatibility with wrapHealthCheck
const checkEnvironmentVariables = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking environment variables");
  const requiredVars = ["PAYLOAD_SECRET", "DATABASE_URL"];
  const missingVars = requiredVars.filter((v) => {
    const envValue = getEnvValue(v);
    return envValue == null || envValue === "";
  });

  if (missingVars.length > 0) {
    logger.warn("Missing required environment variables", { missingVars });
  } else {
    logger.debug("All required environment variables are set");
  }

  return {
    status: missingVars.length > 0 ? "error" : "healthy",
    message:
      missingVars.length > 0
        ? `Missing required environment variables: ${missingVars.join(", ")}`
        : "All required environment variables are set",
  };
};

const checkUploadsDirectory = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking uploads directory");
  // Find the project root by looking for package.json
  let currentDir = process.cwd();
  let projectRoot = currentDir;

  // Constants for path matching
  const APPS_WEB_PATH = "/apps/web/";
  const APPS_WEB_SUFFIX = "/apps/web";
  // Walk up directories to find the web app root (where package.json is)
  while (!projectRoot.endsWith(APPS_WEB_SUFFIX) && projectRoot !== "/") {
    if (currentDir.includes(APPS_WEB_PATH)) {
      projectRoot = currentDir.substring(0, currentDir.indexOf(APPS_WEB_PATH) + APPS_WEB_PATH.length);
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  const uploadDirEnv = getEnv().UPLOAD_DIR;
  const uploadsDir = path.isAbsolute(uploadDirEnv) ? uploadDirEnv : path.join(projectRoot, uploadDirEnv);

  try {
    await fs.access(uploadsDir, fs.constants.W_OK);
    logger.debug("Uploads directory is writable", { path: uploadsDir });
    return { status: "healthy", message: "Uploads directory is writable" };
  } catch (error) {
    logger.warn("Uploads directory not writable", { path: uploadsDir, error: (error as Error).message });
    // In CI, treat missing uploads directory as a warning instead of error
    if (getEnv().CI === "true") {
      return { status: "degraded", message: "Uploads directory not writable (CI environment)" };
    }
    return { status: "error", message: "Uploads directory not writable" };
  }
};

/**
 * Stable, unambiguous landmark. Any provider that works at all resolves it, so
 * a failure points at the provider rather than at the query.
 */
const GEOCODING_PROBE_ADDRESS = "1600 Amphitheatre Parkway, Mountain View, CA";

/**
 * A health endpoint gets polled; a live probe on every call would hammer a
 * third-party geocoder (and burn its quota). Probe at most once per window and
 * replay the verdict in between.
 */
const GEOCODING_PROBE_TTL_MS = 5 * 60 * 1000;

/**
 * Hard ceiling so /api/admin/health cannot hang behind a stalled provider.
 * testConfiguration bounds each provider individually but walks them
 * sequentially, so several slow providers would otherwise add up.
 */
const GEOCODING_PROBE_TIMEOUT_MS = 5000;

let geocodingProbeCache: { at: number; result: HealthCheckResult } | null = null;

/** Test seam: drop the memoised probe so each test observes its own fixture. */
export const resetGeocodingProbeCache = (): void => {
  geocodingProbeCache = null;
};

const describeProbeError = (outcome: unknown): string => {
  const error = (outcome as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error !== "") return error;
  if (error instanceof Error) return error.message;
  return "unknown error";
};

const summarizeGeocodingProbe = (probe: Record<string, unknown>, enabledCount: number): HealthCheckResult => {
  const entries = Object.entries(probe);

  // testConfiguration only walks providers it managed to construct. Rows say
  // enabled but nothing was probed => the configuration is unusable.
  if (entries.length === 0) {
    return {
      status: "error",
      message: `${enabledCount} enabled geocoding provider(s) configured, but none could be probed`,
    };
  }

  const working = entries.filter(([, outcome]) => (outcome as { success?: boolean } | null)?.success === true);
  const failed = entries.filter(([, outcome]) => (outcome as { success?: boolean } | null)?.success !== true);

  if (failed.length === 0) {
    return {
      status: "healthy",
      message: `${working.length} geocoding provider(s) answered a live test geocode: ${working
        .map(([name]) => name)
        .join(", ")}`,
    };
  }

  const detail = failed.map(([name, outcome]) => `${name}: ${describeProbeError(outcome)}`).join("; ");

  // Every provider failing is the state this check exists to catch: an expired
  // key or upstream outage fails every geocode-batch job, and the old row-count
  // check stayed green throughout.
  if (working.length === 0) {
    return {
      status: "error",
      message: `Every enabled geocoding provider failed a live test geocode - geocode-batch jobs will fail (${detail})`,
    };
  }

  return {
    status: "degraded",
    message: `Some geocoding providers failed a live test geocode (working: ${working
      .map(([name]) => name)
      .join(", ")}; failing: ${detail})`,
  };
};

const runGeocodingProbe = async (payload: Payload, enabledCount: number): Promise<HealthCheckResult> => {
  const { createGeocodingService } = await import("./services/geocoding");
  const service = createGeocodingService(payload);

  const TIMED_OUT = Symbol("geocoding-probe-timeout");
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof TIMED_OUT>((resolve) => {
    timeoutId = setTimeout(() => resolve(TIMED_OUT), GEOCODING_PROBE_TIMEOUT_MS);
  });

  try {
    const outcome = await Promise.race([service.testConfiguration(GEOCODING_PROBE_ADDRESS), timeoutPromise]);

    if (outcome === TIMED_OUT) {
      // Inconclusive, not proven broken: the per-provider timeout is the same
      // length, so we may have cut in just before a provider was marked failed.
      // Claiming "error" here would 503 the whole endpoint on a guess.
      logger.warn("Geocoding probe timed out", { timeoutMs: GEOCODING_PROBE_TIMEOUT_MS });
      return {
        status: "degraded",
        message: `Geocoding probe inconclusive - no provider answered within ${GEOCODING_PROBE_TIMEOUT_MS}ms`,
      };
    }

    return summarizeGeocodingProbe(outcome, enabledCount);
  } finally {
    clearTimeout(timeoutId);
  }
};

const checkGeocodingService = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking geocoding service");

  try {
    logger.debug("Getting Payload instance for geocoding check");
    const payload = await getPayload({ config });

    logger.debug("Querying geocoding providers");
    const providers = await payload.find({
      collection: COLLECTION_NAMES.GEOCODING_PROVIDERS,
      where: { enabled: { equals: true } },
      limit: 1,
    });

    if (providers.totalDocs === 0) {
      logger.debug("Geocoding service check complete", { totalProviders: 0 });
      return { status: "degraded", message: "No enabled geocoding providers found in the database" };
    }

    const cached = geocodingProbeCache;
    if (cached != null && Date.now() - cached.at < GEOCODING_PROBE_TTL_MS) {
      logger.debug("Reusing memoised geocoding probe", { ageMs: Date.now() - cached.at });
      return cached.result;
    }

    const result = await runGeocodingProbe(payload, providers.totalDocs);
    // Last writer wins on purpose: two concurrent health calls would each
    // run a probe and store an equally fresh verdict, so there is nothing to
    // lose. The memo exists to bound how often the provider is touched, not
    // to serialise callers.
    // eslint-disable-next-line require-atomic-updates -- see above
    geocodingProbeCache = { at: Date.now(), result };

    logger.debug("Geocoding service check complete", { status: result.status, totalProviders: providers.totalDocs });

    return result;
  } catch (error) {
    logger.error("Geocoding service check failed", { error: (error as Error).message, stack: (error as Error).stack });
    return { status: "error", message: (error as Error).message };
  }
};

const checkPayloadCMS = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking Payload CMS");

  try {
    logger.debug("Getting Payload instance for CMS check");
    const payload = await getPayload({ config });

    logger.debug("Testing Payload by querying users collection");
    await payload.find({ collection: COLLECTION_NAMES.USERS, limit: 1 });

    logger.debug("Payload CMS check passed");
    return { status: "healthy", message: "Payload CMS is accessible" };
  } catch (error) {
    logger.error("Payload CMS check failed", { error: (error as Error).message, stack: (error as Error).stack });
    return { status: "error", message: (error as Error).message };
  }
};

const checkMigrations = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking migrations");

  try {
    logger.debug("Getting Payload instance for migrations check");
    const payload = await getPayload({ config });

    // Constants for path matching
    const APPS_WEB_PATH = "/apps/web/";
    const APPS_WEB_SUFFIX = "/apps/web";

    // Find the project root by looking for the web app directory
    let currentDir = process.cwd();
    let projectRoot = currentDir;

    // Walk up directories to find the web app root (where package.json is)
    while (!projectRoot.endsWith(APPS_WEB_SUFFIX) && projectRoot !== "/") {
      if (currentDir.includes(APPS_WEB_PATH)) {
        projectRoot = currentDir.substring(0, currentDir.indexOf(APPS_WEB_PATH) + APPS_WEB_SUFFIX.length);
        break;
      }
      currentDir = path.dirname(currentDir);
    }

    const migrationsDir = path.join(projectRoot, "migrations");
    logger.debug("Reading migrations directory", { path: migrationsDir });

    const migrationFiles = await fs.readdir(migrationsDir);
    logger.debug("Found migration files", { count: migrationFiles.length });

    const executedMigrations = await payload.find({ collection: COLLECTION_NAMES.PAYLOAD_MIGRATIONS, limit: 1000 });

    const executedMigrationNames = executedMigrations.docs.map((m) => m.name);
    const pendingMigrations = migrationFiles.filter(
      (f) => f.endsWith(".ts") && !executedMigrationNames.includes(f.replace(".ts", ""))
    );

    logger.debug("Migration status", {
      totalFiles: migrationFiles.length,
      executed: executedMigrationNames.length,
      pending: pendingMigrations.length,
    });

    return {
      status: pendingMigrations.length > 0 ? "degraded" : "healthy",
      message:
        pendingMigrations.length > 0
          ? `${pendingMigrations.length} pending migrations: ${pendingMigrations.join(", ")}`
          : "All migrations are up to date",
    };
  } catch (error) {
    logger.error("Migrations check failed", { error: (error as Error).message, stack: (error as Error).stack });
    throw error; // Re-throw to be caught by the wrapper
  }
};

const checkPostGIS = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking PostGIS extension");

  try {
    logger.debug("Getting Payload instance for PostGIS check");
    const payload = await getPayload({ config });

    logger.debug("Querying for PostGIS extension");
    const postgisCheck = await payload.db.drizzle.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'postgis'`);

    const hasPostGIS = (postgisCheck as { rowCount: number }).rowCount > 0;
    logger.debug("PostGIS check complete", { hasPostGIS });

    return {
      status: hasPostGIS ? "healthy" : "error",
      message: hasPostGIS ? "PostGIS extension is enabled" : "PostGIS extension not found",
    };
  } catch (error) {
    logger.error("PostGIS check failed", { error: (error as Error).message, stack: (error as Error).stack });
    return { status: "error", message: (error as Error).message };
  }
};

const checkDatabaseFunctions = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking database functions");

  try {
    logger.debug("Getting Payload instance for database functions check");
    const payload = await getPayload({ config });

    const requiredFunctions = ["cluster_events", "calculate_event_histogram"];
    const missingFunctions: string[] = [];

    for (const functionName of requiredFunctions) {
      logger.debug(`Checking for function: ${functionName}`);
      const functionCheck = (await payload.db.drizzle.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc
          WHERE proname = ${functionName}
        ) as exists
      `)) as { rows: Array<{ exists: boolean }> };

      const exists = functionCheck.rows[0]?.exists ?? false;
      if (!exists) {
        missingFunctions.push(functionName);
      }
    }

    logger.debug("Database functions check complete", {
      total: requiredFunctions.length,
      missing: missingFunctions.length,
    });

    return {
      status: missingFunctions.length > 0 ? "error" : "healthy",
      message:
        missingFunctions.length > 0
          ? `Missing required database functions: ${missingFunctions.join(", ")}`
          : "All required database functions are present",
    };
  } catch (error) {
    logger.error("Database functions check failed", { error: (error as Error).message, stack: (error as Error).stack });
    return { status: "error", message: (error as Error).message };
  }
};

/**
 * Recognise hosts that come from example configuration rather than a real
 * mail server. RFC 2606 reserves example.com/net/org precisely so they never
 * resolve, which is what makes them a silent trap here.
 */
const isPlaceholderHost = (host: string | undefined): boolean => {
  if (host == null || host === "") return false;
  const normalized = host.trim().toLowerCase();
  return (
    /(^|\.)example\.(com|net|org)$/.test(normalized) ||
    normalized.includes("your-provider") ||
    normalized.includes("changeme") ||
    normalized.includes("change_me")
  );
};

// eslint-disable-next-line @typescript-eslint/require-await -- Async for interface compatibility with wrapHealthCheck
const checkEmailConfiguration = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking email configuration");

  const env = getEnv();
  const hasSmtpHost = Boolean(env.EMAIL_SMTP_HOST);
  const isProduction = env.NODE_ENV === "production";

  // A placeholder host is the worst of both worlds: the app treats it as a
  // working mail server, so every send fails with ENOTFOUND. That includes the
  // verification email Payload sends while registering the first admin, which
  // leaves a fresh deployment with no way to create one. This used to report
  // "healthy" purely because the variable was set.
  if (hasSmtpHost && isPlaceholderHost(env.EMAIL_SMTP_HOST)) {
    logger.warn("EMAIL_SMTP_HOST is a placeholder", { host: env.EMAIL_SMTP_HOST });
    return {
      status: "error",
      message:
        `EMAIL_SMTP_HOST is a placeholder (${env.EMAIL_SMTP_HOST}) - every send will fail. ` +
        "Set a real SMTP host, or leave it unset to run without outgoing mail.",
    };
  }

  if (isProduction && !hasSmtpHost) {
    // Degraded rather than error: running without outgoing mail is a supported
    // configuration, not a fault. The app works; account verification and
    // password resets simply are not delivered.
    logger.warn("SMTP not configured in production - outgoing email is disabled");
    return {
      status: "degraded",
      message: "SMTP not configured (EMAIL_SMTP_HOST not set) - outgoing email is disabled",
    };
  }

  if (hasSmtpHost) {
    const hasSmtpUser = Boolean(env.EMAIL_SMTP_USER);
    const hasSmtpPass = Boolean(env.EMAIL_SMTP_PASS);

    // Half-filled credentials are the same trap as the placeholder host: the
    // app believes it can authenticate, so every send fails with EAUTH (535).
    // send-email-job classifies auth failures as terminal, so the job is
    // cancelled instead of retried and the mail is dropped silently — including
    // account verification and password resets. docker-compose.prod.yml
    // defaults both variables to empty, so setting only the user is easy to do.
    if (hasSmtpUser !== hasSmtpPass) {
      const setVar = hasSmtpUser ? "EMAIL_SMTP_USER" : "EMAIL_SMTP_PASS";
      const missingVar = hasSmtpUser ? "EMAIL_SMTP_PASS" : "EMAIL_SMTP_USER";
      logger.warn("SMTP credentials are incomplete", { setVar, missingVar });
      return {
        status: "error",
        message:
          `SMTP credentials incomplete: ${setVar} is set but ${missingVar} is empty - ` +
          "every send fails with an auth error, and send-email-job treats that as terminal, " +
          `so mail is dropped without retry. Set both, or neither for an unauthenticated relay.`,
      };
    }

    logger.debug("SMTP configured", { hasAuth: hasSmtpUser });
    return {
      status: "healthy",
      message: `SMTP configured (${env.EMAIL_SMTP_HOST})${hasSmtpUser ? " with authentication" : ""}`,
    };
  }

  // Development mode without SMTP - using ethereal.email
  logger.debug("Using ethereal.email for development");
  return { status: "degraded", message: "Development mode - using ethereal.email (view at https://ethereal.email)" };
};

const checkDatabaseSize = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking database size");

  try {
    logger.debug("Getting Payload instance for database size check");
    const payload = await getPayload({ config });

    logger.debug("Querying database size");
    // current_database(), not a hardcoded name — any deployment whose DB is
    // not literally named "timetiles" otherwise errors here and turns
    // /api/admin/health into a permanent 503.
    const sizeCheck = (await payload.db.drizzle.execute(sql`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `)) as { rows: Array<{ size: string }> };

    const size = sizeCheck.rows[0]?.size ?? "Unknown";
    logger.debug("Database size check complete", { size });

    return { status: "healthy", message: size };
  } catch (error) {
    logger.error("Database size check failed", { error: (error as Error).message, stack: (error as Error).stack });
    return { status: "error", message: (error as Error).message };
  }
};

const checkScraperRunner = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking scraper runner connectivity");

  const scraperRunnerUrl = getEnv().SCRAPER_RUNNER_URL;
  if (!scraperRunnerUrl) {
    logger.debug("SCRAPER_RUNNER_URL not configured");
    return { status: "degraded", message: "Scraper runner not configured (SCRAPER_RUNNER_URL not set)" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${scraperRunnerUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn("Scraper runner returned non-OK status", { status: response.status, url: scraperRunnerUrl });
      return { status: "error", message: `Scraper runner returned HTTP ${response.status}` };
    }

    const body = (await response.json()) as { status?: string };

    if (body.status === "ok") {
      logger.debug("Scraper runner is healthy", { url: scraperRunnerUrl });
      return { status: "healthy", message: `Scraper runner is reachable (${scraperRunnerUrl})` };
    }

    logger.warn("Scraper runner returned unexpected status", { body });
    return { status: "error", message: `Scraper runner returned unexpected status: ${JSON.stringify(body)}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Scraper runner health check failed", { url: scraperRunnerUrl, error: message });
    return { status: "error", message: `Scraper runner unreachable: ${message}` };
  }
};

const wrapHealthCheck = async (
  checkFn: () => Promise<HealthCheckResult>,
  checkName: string
): Promise<HealthCheckResult> => {
  try {
    return await checkFn();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`${checkName} check threw exception`, { error: message });
    return { status: "error" as const, message: `${checkName} check failed: ${message}` };
  }
};

const createHealthSummary = (results: {
  env: HealthCheckResult;
  uploads: HealthCheckResult;
  geocoding: HealthCheckResult;
  email: HealthCheckResult;
  cms: HealthCheckResult;
  migrations: HealthCheckResult;
  postgis: HealthCheckResult;
  dbFunctions: HealthCheckResult;
  dbSize: HealthCheckResult;
  scraperRunner: HealthCheckResult;
}) => ({
  env: results.env.status,
  uploads: results.uploads.status,
  geocoding: results.geocoding.status,
  email: results.email.status,
  cms: results.cms.status,
  migrations: results.migrations.status,
  postgis: results.postgis.status,
  dbFunctions: results.dbFunctions.status,
  dbSize: results.dbSize.status,
  scraperRunner: results.scraperRunner.status,
});

/**
 * Minimal liveness check that only verifies database connectivity.
 *
 * Used by the public health endpoint to confirm the service is alive
 * without exposing any internal diagnostic details.
 */
export const runLivenessCheck = async (): Promise<{ status: "ok" | "error"; database: "connected" | "error" }> => {
  try {
    const payload = await getPayload({ config });
    await payload.db.drizzle.execute(sql`SELECT 1`);
    return { status: "ok", database: "connected" };
  } catch {
    return { status: "error", database: "error" };
  }
};

export const runHealthChecks = async () => {
  logger.info("Starting health checks");
  const startTime = Date.now();

  const [env, uploads, geocoding, email, cms, migrations, postgis, dbFunctions, dbSize, scraperRunner] =
    await Promise.all([
      wrapHealthCheck(checkEnvironmentVariables, "Environment"),
      wrapHealthCheck(checkUploadsDirectory, "Uploads directory"),
      wrapHealthCheck(checkGeocodingService, "Geocoding service"),
      wrapHealthCheck(checkEmailConfiguration, "Email"),
      wrapHealthCheck(checkPayloadCMS, "Payload CMS"),
      wrapHealthCheck(checkMigrations, "Migrations"),
      wrapHealthCheck(checkPostGIS, "PostGIS"),
      wrapHealthCheck(checkDatabaseFunctions, "Database functions"),
      wrapHealthCheck(checkDatabaseSize, "Database size"),
      wrapHealthCheck(checkScraperRunner, "Scraper runner"),
    ]);

  const results = { env, uploads, geocoding, email, cms, migrations, postgis, dbFunctions, dbSize, scraperRunner };
  const duration = Date.now() - startTime;

  logger.info("Health checks completed", { duration, summary: createHealthSummary(results) });

  return results;
};
