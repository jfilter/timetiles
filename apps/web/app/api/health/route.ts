import { NextResponse } from "next/server";
import { runHealthChecks } from "../../../lib/health";
import { createLogger } from "../../../lib/logger";

const logger = createLogger("health-api");

export async function GET() {
  logger.info("Health check endpoint called");
  
  try {
    const results = await runHealthChecks();
    logger.debug("Health check results:", results);
    
    const hasError = Object.values(results).some((r) => r.status === "error");
    const hasPending = results.migrations.status === "pending";
    const postgisNotFound = results.postgis.status === "not found";
    const hasWarning = Object.values(results).some((r) => r.status === "warning");

    let overallStatus = 200;
    if (hasError || postgisNotFound) {
      overallStatus = 503;
      logger.warn("Health check returning 503 due to errors", {
        hasError,
        postgisNotFound,
        results,
      });
    } else if (hasPending || hasWarning) {
      overallStatus = 200; // Still healthy, but with a warning
      logger.info("Health check has warnings but returning 200", {
        hasPending,
        hasWarning,
      });
    } else {
      logger.info("Health check passed successfully");
    }

    return NextResponse.json(results, { status: overallStatus });
  } catch (error) {
    logger.error("Health check failed with exception", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Return a more detailed error response for debugging
    const errorResponse = {
      error: "Health check failed",
      message: error instanceof Error ? error.message : "Unknown error",
      stack: process.env.NODE_ENV !== "production" ? (error as Error).stack : undefined,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? "Set" : "Not set",
        PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ? "Set" : "Not set",
        LOG_LEVEL: process.env.LOG_LEVEL || "default",
      },
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}