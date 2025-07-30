/**
 * API route for running application health checks.
 *
 * It provides an endpoint that executes a series of checks on critical system components,
 * such as environment variables, database connectivity, and service availability. The route
 * returns a JSON response with the status of each check, which can be used for monitoring,
 * automated testing, and production readiness assessments.
 * 
 * @category API Routes
 * @module
 */
import { NextResponse } from "next/server";

import { runHealthChecks } from "@/lib/health";
import { createLogger } from "@/lib/logger";

const logger = createLogger("health-api");

const determineHealthStatus = (results: Record<string, { status: string }>) => {
  const hasError = Object.values(results).some((r) => r.status === "error");
  const hasPending = results.migrations?.status === "pending";
  const postgisNotFound = results.postgis?.status === "not found";
  const hasWarning = Object.values(results).some((r) => r.status === "warning");

  if (hasError || postgisNotFound) {
    logger.warn("Health check returning 503 due to errors", {
      hasError,
      postgisNotFound,
      results,
    });
    return 503;
  } else if (hasPending || hasWarning) {
    logger.info("Health check has warnings but returning 200", {
      hasPending,
      hasWarning,
    });
    return 200;
  } else {
    logger.info("Health check passed successfully");
    return 200;
  }
};

const createErrorResponse = (error: unknown) => ({
  error: "Health check failed",
  message: error instanceof Error ? error.message : "Unknown error",
  stack: process.env.NODE_ENV !== "production" ? (error as Error).stack : undefined,
  env: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL != undefined ? "Set" : "Not set",
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET != undefined ? "Set" : "Not set",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "default",
  },
});

/**
 * Health Check API Endpoint
 *
 * Executes comprehensive health checks on critical system components including
 * environment variables, database connectivity, migrations status, and service
 * availability. Returns JSON response with detailed status of each check.
 *
 * @returns Promise resolving to NextResponse with health check results or error details
 */
export const GET = async () => {
  logger.info("Health check endpoint called");

  try {
    const results = await runHealthChecks();
    logger.debug("Health check results:", results);

    const overallStatus = determineHealthStatus(results);
    return NextResponse.json(results, { status: overallStatus });
  } catch (error) {
    logger.error("Health check failed with exception", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorResponse = createErrorResponse(error);
    return NextResponse.json(errorResponse, { status: 500 });
  }
};
