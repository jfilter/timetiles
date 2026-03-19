/**
 * Admin-only diagnostic health endpoint.
 *
 * Runs comprehensive health checks on all critical system components including
 * environment variables, database connectivity, migrations status, PostGIS,
 * geocoding, email, uploads, and scraper runner. Only accessible to admin users.
 *
 * @category API Routes
 * @module
 */
import { apiRoute } from "@/lib/api";
import { runHealthChecks } from "@/lib/health";
import { createLogger, logError } from "@/lib/logger";

const logger = createLogger("admin-health-api");

const determineHealthStatus = (results: Record<string, { status: string }>) => {
  const hasError = Object.values(results).some((r) => r.status === "error");
  const hasPending = results.migrations?.status === "pending";
  const postgisNotFound = results.postgis?.status === "not found";
  const hasWarning = Object.values(results).some((r) => r.status === "warning");

  if (hasError || postgisNotFound) {
    logger.warn({ hasError, postgisNotFound, results }, "Admin health check returning 503 due to errors");
    return 503;
  } else if (hasPending || hasWarning) {
    logger.info({ hasPending, hasWarning }, "Admin health check has warnings but returning 200");
    return 200;
  } else {
    logger.info("Admin health check passed successfully");
    return 200;
  }
};

/**
 * Admin Diagnostic Health Check Endpoint.
 *
 * Executes comprehensive health checks on critical system components including
 * environment variables, database connectivity, migrations status, and service
 * availability. Returns JSON response with detailed status of each check.
 *
 * Requires admin authentication.
 *
 * @returns Promise resolving to Response with health check results or error details.
 */
export const GET = apiRoute({
  auth: "admin",
  handler: async () => {
    logger.info("Admin health check endpoint called");

    try {
      const results = await runHealthChecks();
      logger.debug({ results }, "Admin health check results");

      const overallStatus = determineHealthStatus(results);
      if (overallStatus === 503) {
        return Response.json(results, { status: 503 });
      }
      return { ...results };
    } catch (error) {
      logError(error, "admin-health-check");

      return Response.json({ error: "Health check failed", code: "HEALTH_CHECK_FAILED" }, { status: 500 });
    }
  },
});
