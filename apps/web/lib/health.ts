import { sql } from "@payloadcms/db-postgres";
import fs from "fs/promises";
import path from "path";
import { getPayload } from "payload";

import config from "../payload.config";
import { createLogger } from "./logger";

const logger = createLogger("health-checks");

function getEnvValue(key: string): string | undefined {
  // Enhanced safe property access to avoid object injection
  if (
    typeof key === "string" &&
    key.length > 0 &&
    !Object.prototype.hasOwnProperty.call(Object.prototype, key) &&
    Object.prototype.hasOwnProperty.call(process.env, key)
  ) {
    return process.env[key];
  }
  return undefined;
}

function checkEnvironmentVariables() {
  logger.debug("Checking environment variables");
  const requiredVars = ["PAYLOAD_SECRET", "DATABASE_URL"];
  const missingVars = requiredVars.filter((v) => {
    const envValue = getEnvValue(v);
    return envValue === undefined || envValue === null || envValue === "";
  });

  if (missingVars.length > 0) {
    logger.warn("Missing required environment variables", { missingVars });
  } else {
    logger.debug("All required environment variables are set");
  }

  return {
    status: missingVars.length > 0 ? "error" : "ok",
    missing: missingVars,
  };
}

async function checkUploadsDirectory() {
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
      projectRoot = currentDir.substring(
        0,
        currentDir.indexOf(APPS_WEB_PATH) + APPS_WEB_PATH.length,
      );
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  const uploadsDir = path.join(projectRoot, "uploads");

  try {
    await fs.access(uploadsDir, fs.constants.W_OK);
    logger.debug("Uploads directory is writable", { path: uploadsDir });
    return { status: "ok" };
  } catch (error) {
    logger.warn("Uploads directory not writable", {
      path: uploadsDir,
      error: (error as Error).message,
    });
    // In CI, treat missing uploads directory as a warning instead of error
    if (process.env.CI === "true") {
      return {
        status: "warning",
        message: "Uploads directory not writable (CI environment)",
      };
    }
    return { status: "error", message: "Uploads directory not writable" };
  }
}

async function checkGeocodingService() {
  logger.debug("Checking geocoding service");

  try {
    logger.debug("Getting Payload instance for geocoding check");
    const payload = await getPayload({ config });

    logger.debug("Querying geocoding providers");
    const providers = await payload.find({
      collection: "geocoding-providers",
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

    return { status, message };
  } catch (error) {
    logger.error("Geocoding service check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return { status: "error", message: (error as Error).message };
  }
}

async function checkPayloadCMS() {
  logger.debug("Checking Payload CMS");

  try {
    logger.debug("Getting Payload instance for CMS check");
    const payload = await getPayload({ config });

    logger.debug("Testing Payload by querying users collection");
    await payload.find({ collection: "users", limit: 1 });

    logger.debug("Payload CMS check passed");
    return { status: "ok" };
  } catch (error) {
    logger.error("Payload CMS check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return { status: "error", message: (error as Error).message };
  }
}

async function checkMigrations() {
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
        projectRoot = currentDir.substring(
          0,
          currentDir.indexOf(APPS_WEB_PATH) + APPS_WEB_SUFFIX.length,
        );
        break;
      }
      currentDir = path.dirname(currentDir);
    }

    const migrationsDir = path.join(projectRoot, "migrations");
    logger.debug("Reading migrations directory", { path: migrationsDir });

    const migrationFiles = await fs.readdir(migrationsDir);
    logger.debug("Found migration files", { count: migrationFiles.length });

    const executedMigrations = await payload.find({
      collection: "payload-migrations",
      limit: 1000,
    });

    const executedMigrationNames = executedMigrations.docs.map((m) => m.name);
    const pendingMigrations = migrationFiles.filter(
      (f) =>
        f.endsWith(".ts") &&
        !executedMigrationNames.includes(f.replace(".ts", "")),
    );

    logger.debug("Migration status", {
      totalFiles: migrationFiles.length,
      executed: executedMigrationNames.length,
      pending: pendingMigrations.length,
    });

    return {
      status: pendingMigrations.length > 0 ? "pending" : "ok",
      pending: pendingMigrations,
    };
  } catch (error) {
    logger.error("Migrations check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error; // Re-throw to be caught by the wrapper
  }
}

async function checkPostGIS() {
  logger.debug("Checking PostGIS extension");

  try {
    logger.debug("Getting Payload instance for PostGIS check");
    const payload = await getPayload({ config });

    logger.debug("Querying for PostGIS extension");
    const postgisCheck = await payload.db.drizzle.execute(
      sql`SELECT 1 FROM pg_extension WHERE extname = 'postgis'`,
    );

    const hasPostGIS = (postgisCheck as { rowCount: number }).rowCount > 0;
    logger.debug("PostGIS check complete", { hasPostGIS });

    return {
      status: hasPostGIS ? "ok" : "not found",
    };
  } catch (error) {
    logger.error("PostGIS check failed", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return { status: "error", message: (error as Error).message };
  }
}

export async function runHealthChecks() {
  logger.info("Starting health checks");
  const startTime = Date.now();

  const [env, uploads, geocoding, cms, migrations, postgis] = await Promise.all(
    [
      Promise.resolve(checkEnvironmentVariables()).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        logger.error("Environment check threw exception", { error: message });
        return {
          status: "error" as const,
          message: `Environment check failed: ${message}`,
        };
      }),
      checkUploadsDirectory().catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        logger.error("Uploads directory check threw exception", {
          error: message,
        });
        return {
          status: "error" as const,
          message: `Uploads directory check failed: ${message}`,
        };
      }),
      checkGeocodingService().catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        logger.error("Geocoding service check threw exception", {
          error: message,
        });
        return {
          status: "error" as const,
          message: `Geocoding service check failed: ${message}`,
        };
      }),
      checkPayloadCMS().catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        logger.error("Payload CMS check threw exception", { error: message });
        return {
          status: "error" as const,
          message: `Payload CMS check failed: ${message}`,
        };
      }),
      checkMigrations().catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        logger.error("Migrations check threw exception", { error: message });
        return {
          status: "error" as const,
          message: `Migrations check failed: ${message}`,
        };
      }),
      checkPostGIS().catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        logger.error("PostGIS check threw exception", { error: message });
        return {
          status: "error" as const,
          message: `PostGIS check failed: ${message}`,
        };
      }),
    ],
  );

  const duration = Date.now() - startTime;
  logger.info("Health checks completed", {
    duration,
    summary: {
      env: env.status,
      uploads: uploads.status,
      geocoding: geocoding.status,
      cms: cms.status,
      migrations: migrations.status,
      postgis: postgis.status,
    },
  });

  return {
    env,
    uploads,
    geocoding,
    cms,
    migrations,
    postgis,
  };
}
