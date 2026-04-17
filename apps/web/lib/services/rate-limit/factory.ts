/**
 * Factory helpers for selecting the configured rate-limit backend.
 *
 * The default backend is in-memory for local and single-process deployments.
 * Shared deployments can opt into PostgreSQL with `RATE_LIMIT_BACKEND=pg`.
 *
 * @module
 * @category Services
 */

import type { Payload } from "payload";

import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";

import { MemoryRateLimitStore } from "./memory-store";
import { PgRateLimitStore } from "./pg-store";
import type { RateLimitStore } from "./store";

export type RateLimitBackend = "memory" | "pg";

export interface RateLimitStoreSelection {
  backend: RateLimitBackend;
  store: RateLimitStore;
}

export const resolveRateLimitBackend = (rawBackend: string): RateLimitBackend => {
  const normalizedBackend = rawBackend.trim().toLowerCase();

  if (normalizedBackend === "memory" || normalizedBackend === "pg") {
    return normalizedBackend;
  }

  logger.warn(
    { configuredBackend: rawBackend },
    "Unknown RATE_LIMIT_BACKEND configured; falling back to the in-memory rate-limit store"
  );

  return "memory";
};

export const createRateLimitStore = (payload: Payload): RateLimitStoreSelection => {
  const backend = resolveRateLimitBackend(getEnv().RATE_LIMIT_BACKEND);

  return { backend, store: backend === "pg" ? new PgRateLimitStore(payload) : new MemoryRateLimitStore() };
};
