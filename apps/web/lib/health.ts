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
import { getPayload } from "payload";

import config from "../payload.config";
import { COLLECTION_NAMES } from "./constants/import-constants";
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

const checkEnvironmentVariables = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking environment variables");
  const requiredVars = ["PAYLOAD_SECRET", "DATABASE_URL"];
  const missingVars = requiredVars.filter((v) => {
    const envValue = getEnvValue(v);
    return envValue == undefined || envValue == null || envValue === "";
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

  const uploadsDir = path.join(projectRoot, "uploads");

  try {
    await fs.access(uploadsDir, fs.constants.W_OK);
    logger.debug("Uploads directory is writable", { path: uploadsDir });
    return { status: "healthy", message: "Uploads directory is writable" };
  } catch (error) {
    logger.warn("Uploads directory not writable", {
      path: uploadsDir,
      error: (error as Error).message,
    });
    // In CI, treat missing uploads directory as a warning instead of error
    if (process.env.CI === "true") {
      return {
        status: "degraded",
        message: "Uploads directory not writable (CI environment)",
      };
    }
    return { status: "error", message: "Uploads directory not writable" };
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

    const status = providers.totalDocs > 0 ? "ok" : "warning";
    const message =
      providers.totalDocs > 0
        ? `${providers.totalDocs} enabled provider(s) found`
        : "No enabled geocoding providers found in the database";

    logger.debug("Geocoding service check complete", {
      status,
      totalProviders: providers.totalDocs,
    });

    let healthStatus: "healthy" | "degraded" | "error";
    if (status === "ok") {
      healthStatus = "healthy";
    } else if (status === "warning") {
      healthStatus = "degraded";
    } else {
      healthStatus = "error";
    }

    return {
      status: healthStatus,
      message,
    };
  } catch (error) {
    logger.error("Geocoding service check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
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
    logger.error("Payload CMS check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
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

    const executedMigrations = await payload.find({
      collection: COLLECTION_NAMES.PAYLOAD_MIGRATIONS,
      limit: 1000,
    });

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
    logger.error("Migrations check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
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
    logger.error("PostGIS check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
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
    logger.error("Database functions check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return { status: "error", message: (error as Error).message };
  }
};

const checkEmailConfiguration = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking email configuration");

  const hasSmtpHost = Boolean(getEnvValue("EMAIL_SMTP_HOST"));
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !hasSmtpHost) {
    logger.warn("SMTP not configured in production - emails will not be sent");
    return {
      status: "error",
      message: "SMTP not configured (EMAIL_SMTP_HOST not set) - emails will not work in production",
    };
  }

  if (hasSmtpHost) {
    const hasAuth = Boolean(getEnvValue("EMAIL_SMTP_USER"));
    logger.debug("SMTP configured", { hasAuth });
    return {
      status: "healthy",
      message: `SMTP configured (${getEnvValue("EMAIL_SMTP_HOST")})${hasAuth ? " with authentication" : ""}`,
    };
  }

  // Development mode without SMTP - using ethereal.email
  logger.debug("Using ethereal.email for development");
  return {
    status: "degraded",
    message: "Development mode - using ethereal.email (view at https://ethereal.email)",
  };
};

const checkDatabaseSize = async (): Promise<HealthCheckResult> => {
  logger.debug("Checking database size");

  try {
    logger.debug("Getting Payload instance for database size check");
    const payload = await getPayload({ config });

    logger.debug("Querying database size");
    const sizeCheck = (await payload.db.drizzle.execute(sql`
      SELECT pg_size_pretty(pg_database_size('timetiles')) as size
    `)) as { rows: Array<{ size: string }> };

    const size = sizeCheck.rows[0]?.size ?? "Unknown";
    logger.debug("Database size check complete", { size });

    return {
      status: "healthy",
      message: size,
    };
  } catch (error) {
    logger.error("Database size check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return { status: "error", message: (error as Error).message };
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
    return {
      status: "error" as const,
      message: `${checkName} check failed: ${message}`,
    };
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
});

export const runHealthChecks = async () => {
  logger.info("Starting health checks");
  const startTime = Date.now();

  const [env, uploads, geocoding, email, cms, migrations, postgis, dbFunctions, dbSize] = await Promise.all([
    wrapHealthCheck(checkEnvironmentVariables, "Environment"),
    wrapHealthCheck(checkUploadsDirectory, "Uploads directory"),
    wrapHealthCheck(checkGeocodingService, "Geocoding service"),
    wrapHealthCheck(checkEmailConfiguration, "Email"),
    wrapHealthCheck(checkPayloadCMS, "Payload CMS"),
    wrapHealthCheck(checkMigrations, "Migrations"),
    wrapHealthCheck(checkPostGIS, "PostGIS"),
    wrapHealthCheck(checkDatabaseFunctions, "Database functions"),
    wrapHealthCheck(checkDatabaseSize, "Database size"),
  ]);

  const results = { env, uploads, geocoding, email, cms, migrations, postgis, dbFunctions, dbSize };
  const duration = Date.now() - startTime;

  logger.info("Health checks completed", {
    duration,
    summary: createHealthSummary(results),
  });

  return results;
};
