/**
 * TimeScrape runner — executes user-defined scrapers in isolated Podman containers.
 *
 * @module
 * @category Main
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { runRoutes } from "./api/run.js";
import { loadConfig } from "./config.js";
import { createApiKeyAuth } from "./lib/auth-middleware.js";
import { AuthError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { createShutdownHandler } from "./lib/shutdown.js";
import { assertSecurityAssets } from "./security/container-config.js";
import { getActiveRunIds, stopRun } from "./services/runner.js";

const config = loadConfig();

// Before serving anything: a missing seccomp profile would otherwise surface
// once per scraper run as a podman exit 125, long after this process reported
// itself healthy.
assertSecurityAssets();

const app = new Hono();

// API key authentication middleware
app.use("*", createApiKeyAuth(config.SCRAPER_API_KEY));

// Error handler
app.onError((error, c) => {
  if (error instanceof AuthError) {
    return c.json({ error: error.message }, 401);
  }
  logger.error({ error: error.message }, "Unhandled error");
  return c.json({ error: "Internal server error" }, 500);
});

// Mount routes
app.route("/", runRoutes);

// Start server
const server = serve({ fetch: app.fetch, port: config.SCRAPER_PORT }, (info) => {
  logger.info(
    { port: info.port, env: config.NODE_ENV, maxConcurrent: config.SCRAPER_MAX_CONCURRENT },
    "TimeScrape runner started"
  );
});

// This process is PID 1 in its container: without a handler a stop or redeploy
// leaves every running scraper container for the web side's stuck-run reaper.
const shutdown = createShutdownHandler({
  closeServer: (done) => server.close(() => done()),
  getActiveRunIds,
  stopRun,
  exit: (code) => process.exit(code),
});

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
