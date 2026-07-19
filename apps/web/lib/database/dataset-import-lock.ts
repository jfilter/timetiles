/**
 * Per-dataset serialization lease for update-strategy event imports.
 *
 * Two update-strategy imports overwriting the SAME event concurrently form a
 * snapshot chain that a non-LIFO rollback resolves incorrectly (see
 * `create-events-batch/event-snapshots.ts`). This lease serializes the entire
 * mutate-then-rollback phase per dataset, so a second update import cannot start
 * capturing snapshots until the first has finished or fully rolled back — which
 * guarantees every capture records the true original, not a failed intermediate.
 *
 * Implementation: a Postgres SESSION-level advisory lock (`pg_advisory_lock`
 * family) keyed by a namespace hash + dataset id — the same two-int convention
 * as {@link SchemaVersioningService}. Session locks are released automatically
 * when the connection drops, so a crashed worker never leaks the lease: no TTL
 * or heartbeat required.
 *
 * Two deadlock defenses:
 * - Dedicated pool: the lock is held on a connection from a pool ISOLATED from
 *   Payload's work pool. A holder ties up one lease connection for the whole
 *   import but does its actual work (payload.update, …) via the work pool, so it
 *   can always finish and release. Drawing both from one pool would deadlock once
 *   concurrent holders reach pool size (e.g. a multi-sheet update import where
 *   each sheet targets a different dataset).
 * - try-lock + backoff: waiters poll `pg_try_advisory_lock` and release their
 *   connection between attempts, so waiting never ties up a lease connection.
 *
 * @module
 * @category Database
 */
import type { Payload } from "payload";
import { Pool } from "pg";

import { getEnv } from "@/lib/config/env";
import type { createJobLogger } from "@/lib/logger";

type Logger = ReturnType<typeof createJobLogger>;

/** Distinguishes this lock family from other advisory locks (e.g. schema versioning). */
const LOCK_NAMESPACE = "timetiles.dataset_event_import";
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000; // 10 min, then fail the job (Payload retries).
const LEASE_POOL_MAX = 10;
const LEASE_POOL_IDLE_TIMEOUT_MS = 30_000;

/** Minimal client/pool shapes so the acquire logic is unit-testable with a mock pool. */
export interface LeasePoolClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  release: () => void;
}
export interface LeasePool {
  connect: () => Promise<LeasePoolClient>;
}

export interface DatasetImportLease {
  /** Release the advisory lock and return the connection to the lease pool. Idempotent. */
  release: () => Promise<void>;
}

export interface AcquireLeaseOptions {
  /** Inject a pool (tests). Defaults to the process-wide dedicated lease pool. */
  pool?: LeasePool;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

let leasePool: Pool | undefined;

/**
 * Lazily build the dedicated lease pool, reusing the work pool's connection
 * string so it points at the same database with the same credentials.
 */
const getDefaultLeasePool = (payload: Payload): LeasePool => {
  if (leasePool) return leasePool;
  const workPoolConnectionString = (payload.db as unknown as { pool?: { options?: { connectionString?: string } } })
    .pool?.options?.connectionString;
  const connectionString = workPoolConnectionString ?? getEnv().DATABASE_URL;
  leasePool = new Pool({ connectionString, max: LEASE_POOL_MAX, idleTimeoutMillis: LEASE_POOL_IDLE_TIMEOUT_MS });
  return leasePool;
};

/** Close the dedicated lease pool. For graceful shutdown / test teardown. */
export const closeDatasetLeasePool = async (): Promise<void> => {
  const pool = leasePool;
  leasePool = undefined;
  if (pool) await pool.end();
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const makeLease = (client: LeasePoolClient, datasetId: number, log: Logger): DatasetImportLease => {
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1)::int, $2::int)", [LOCK_NAMESPACE, datasetId]);
      } catch (error) {
        // Releasing the connection drops the session, which frees the lock regardless.
        log.warn("Failed to explicitly unlock dataset import lease; connection release frees it", { datasetId, error });
      } finally {
        client.release();
      }
    },
  };
};

/**
 * Acquire a per-dataset session-level advisory lock, serializing update-strategy
 * imports into the same dataset across their whole mutate-then-rollback phase.
 *
 * Blocks (by polling) until the lock is free, then returns a lease whose
 * `release()` frees it. Throws after `maxWaitMs` so a wedged holder cannot block
 * a dataset forever — the caller lets the job fail and Payload retries.
 */
export const acquireDatasetImportLease = async (
  payload: Payload,
  datasetId: number,
  log: Logger,
  options: AcquireLeaseOptions = {}
): Promise<DatasetImportLease> => {
  const pool = options.pool ?? getDefaultLeasePool(payload);
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const startedAt = Date.now();
  let announcedWait = false;

  while (Date.now() - startedAt < maxWaitMs) {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT pg_try_advisory_lock(hashtext($1)::int, $2::int) AS locked", [
        LOCK_NAMESPACE,
        datasetId,
      ]);
      if (result.rows[0]?.locked === true) {
        if (announcedWait) {
          log.info("Acquired dataset import lease after waiting", { datasetId, waitedMs: Date.now() - startedAt });
        }
        return makeLease(client, datasetId, log);
      }
    } catch (error) {
      client.release();
      throw error;
    }
    // Not acquired — free the connection so waiting never ties up a lease connection.
    client.release();
    if (!announcedWait) {
      announcedWait = true;
      log.info("Waiting for a concurrent update-strategy import to finish on this dataset", { datasetId });
    }
    await delay(pollIntervalMs);
  }

  throw new Error(`Timed out after ${maxWaitMs}ms waiting for the import lease on dataset ${datasetId}`);
};
