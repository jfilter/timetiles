/**
 * POST /run — Execute a scraper in a Podman container.
 *
 * @module
 * @category API
 */

import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

import { RunnerError } from "../lib/errors.js";
import { logError } from "../lib/logger.js";
import { executeRun, isRunActive, stopRun, getActiveRunCount } from "../services/runner.js";

const runRequestSchema = z.object({
  run_id: z.string().uuid(),
  runtime: z.enum(["python", "node"]),
  entrypoint: z.string().min(1),
  output_file: z.string().optional(),
  code_url: z.string().url().optional(),
  code: z.record(z.string()).optional(),
  env: z.record(z.string()).optional(),
  limits: z
    .object({
      timeout_secs: z.number().int().min(1).max(3600).optional(),
      memory_mb: z.number().int().min(64).max(4096).optional(),
    })
    .optional(),
});

export const runRoutes = new Hono();

runRoutes.post("/run", async (c) => {
  const body = await c.req.json();
  const parsed = runRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const request = parsed.data;

  if (!request.code_url && !request.code) {
    return c.json({ error: "Either code_url or code must be provided" }, 400);
  }

  try {
    const result = await executeRun(request);
    return c.json(result);
  } catch (error) {
    if (error instanceof RunnerError) {
      return c.json({ error: error.message, code: error.code }, error.statusCode as ContentfulStatusCode);
    }
    logError("Unexpected error in /run", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

runRoutes.post("/stop/:runId", async (c) => {
  const runId = c.req.param("runId");

  if (!isRunActive(runId)) {
    return c.json({ error: "Run not found or already completed" }, 404);
  }

  await stopRun(runId);
  return c.json({ status: "stopped" });
});

runRoutes.get("/status/:runId", (c) => {
  const runId = c.req.param("runId");
  return c.json({ active: isRunActive(runId) });
});

runRoutes.get("/health", (c) => {
  return c.json({ status: "ok", active_runs: getActiveRunCount(), timestamp: new Date().toISOString() });
});
