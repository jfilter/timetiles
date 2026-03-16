/**
 * TimeScrape runner — executes user-defined scrapers in isolated Podman containers.
 *
 * @module
 * @category Main
 */

import { timingSafeEqual } from "node:crypto";

import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { runRoutes } from "./api/run.js";
import { loadConfig } from "./config.js";
import { AuthError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";

const config = loadConfig();

const app = new Hono();

// API key authentication middleware
app.use("*", async (c, next) => {
  // Skip auth for health check and metrics
  if (c.req.path === "/health" || c.req.path === "/metrics") {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError();
  }

  const token = authHeader.slice(7);
  const tokenBuf = Buffer.from(token);
  const keyBuf = Buffer.from(config.SCRAPER_API_KEY);
  if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
    throw new AuthError();
  }

  return next();
});

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
serve({ fetch: app.fetch, port: config.SCRAPER_PORT }, (info) => {
  logger.info(
    { port: info.port, env: config.NODE_ENV, maxConcurrent: config.SCRAPER_MAX_CONCURRENT },
    "TimeScrape runner started"
  );
});
