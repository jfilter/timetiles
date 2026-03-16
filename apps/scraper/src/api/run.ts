/**
 * POST /run — Execute a scraper in a Podman container.
 * GET /output/:runId/:filename — Download scraper output file.
 * DELETE /output/:runId — Clean up output files after download.
 * GET /metrics — Return runner metrics (no auth required).
 *
 * @module
 * @category API
 */

import { createReadStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

import { getConfig } from "../config.js";
import { RunnerError } from "../lib/errors.js";
import { logError } from "../lib/logger.js";
import { executeRun, isRunActive, stopRun, getActiveRunCount, getMetrics } from "../services/runner.js";

const runRequestSchema = z.object({
  run_id: z.string().uuid(),
  runtime: z.enum(["python", "node"]),
  entrypoint: z
    .string()
    .min(1)
    .refine((v) => !v.includes("..") && !v.startsWith("/"), "Invalid entrypoint path"),
  output_file: z
    .string()
    .refine((v) => !v.includes(".."), "output_file must not contain path traversal")
    .optional(),
  code_url: z
    .string()
    .url()
    .refine((v) => v.startsWith("https://"), "Only HTTPS URLs are allowed")
    .optional(),
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
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
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

runRoutes.get("/output/:runId/:filename", async (c) => {
  const { runId, filename } = c.req.param();

  if (!runId || !filename || filename.includes("..") || filename.includes("/")) {
    return c.json({ error: "Invalid parameters" }, 400);
  }

  const config = getConfig();
  const filePath = join(config.SCRAPER_DATA_DIR, "outputs", runId, filename);

  try {
    const stats = await stat(filePath);
    const fileStream = createReadStream(filePath);

    return new Response(fileStream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Length": stats.size.toString(),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return c.json({ error: "Output not found" }, 404);
  }
});

runRoutes.delete("/output/:runId", async (c) => {
  const { runId } = c.req.param();

  if (!runId || runId.includes("..") || runId.includes("/")) {
    return c.json({ error: "Invalid parameters" }, 400);
  }

  const config = getConfig();
  const outputDir = join(config.SCRAPER_DATA_DIR, "outputs", runId);

  try {
    await rm(outputDir, { recursive: true, force: true });
  } catch {
    /* already cleaned */
  }

  return c.json({ status: "deleted" });
});

runRoutes.get("/health", (c) => {
  return c.json({ status: "ok", active_runs: getActiveRunCount(), timestamp: new Date().toISOString() });
});

runRoutes.get("/metrics", (c) => {
  return c.json(getMetrics());
});
