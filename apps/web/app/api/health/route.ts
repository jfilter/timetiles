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
