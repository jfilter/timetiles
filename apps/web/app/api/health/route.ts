/**
 * Public liveness endpoint.
 *
 * Returns minimal status information (ok/error and database connectivity)
 * without exposing any internal diagnostic details. Full diagnostics are
 * available at the admin-only `/api/admin/health` endpoint.
 *
 * @category API Routes
 * @module
 */
import { apiRoute } from "@/lib/api";
import { runLivenessCheck } from "@/lib/health";
import { createLogger, logError } from "@/lib/logger";

const logger = createLogger("health-api");

/**
 * Liveness Check API Endpoint.
 *
 * Verifies database connectivity and returns a minimal status response.
 * No internal details are exposed.
 *
 * @returns Promise resolving to Response with liveness status.
 */
export const GET = apiRoute({
  auth: "none",
  handler: async () => {
    logger.info("Liveness check endpoint called");

    try {
      const result = await runLivenessCheck();

      if (result.status === "error") {
        return Response.json(result, { status: 503 });
      }

      return { ...result };
    } catch (error) {
      logError(error, "liveness-check");
      return Response.json({ status: "error", database: "error" }, { status: 500 });
    }
  },
});
