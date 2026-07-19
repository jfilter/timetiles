/**
 * Per-dataset serialization lease that ENFORCES sequential import processing.
 *
 * Imports are processed one-at-a-time per dataset (ADR 0041): every create-events
 * import acquires this lease before mutating and holds it across its whole
 * mutate-then-rollback phase, so two imports never touch the same dataset at once.
 * That invariant is what keeps the all-or-nothing rollback simple — a failed or
 * crashed import reverts its own changes via its retry, with no concurrent import
 * to interleave (which would otherwise chain snapshots into an unresolvable
 * non-LIFO rollback). Different datasets never contend.
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
import { type createJobLogger, logError } from "@/lib/logger";

type Logger = ReturnType<typeof createJobLogger>;

/** Distinguishes this lock family from other advisory locks (e.g. schema versioning). */
const LOCK_NAMESPACE = "timetiles.dataset_event_import";
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000; // 10 min, then fail the job (Payload retries).
const LEASE_POOL_MAX = 10;
const LEASE_POOL_IDLE_TIMEOUT_MS = 30_000;
// Bound each connect() so a fully-checked-out pool can't hang a waiter forever;
// a timed-out connect is retried within the caller's maxWaitMs budget.
const LEASE_POOL_CONNECT_TIMEOUT_MS = 10_000;

/** Minimal client/pool shapes so the acquire logic is unit-testable with a mock pool. */
export interface LeasePoolClient {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  /** Pass an error/true to DESTROY the connection instead of returning it to the pool. */
  release: (destroy?: boolean | Error) => void;
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
  const pool = new Pool({
    connectionString,
    max: LEASE_POOL_MAX,
    idleTimeoutMillis: LEASE_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: LEASE_POOL_CONNECT_TIMEOUT_MS,
  });
  // pg emits idle-client errors as pool events; without a listener they become
  // uncaught process errors. Log and let pg evict the broken client.
  pool.on("error", (error) => logError(error, "Dataset import lease pool error (idle client)"));
  leasePool = pool;
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
        client.release();
      } catch (error) {
        // Unlock failed → the session's lock state is uncertain, and advisory locks
        // are reentrant (a later reuse could re-take and skew the lock count). DESTROY
        // the connection (don't return it to the pool) so the backend session ends and
        // Postgres frees the lock outright.
        log.warn("Failed to unlock dataset import lease; destroying the connection to free the lock", {
          datasetId,
          error,
        });
        client.release(error instanceof Error ? error : new Error(String(error)));
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
    let client: LeasePoolClient;
    try {
      client = await pool.connect();
    } catch (error) {
      // Pool fully checked out (connect timed out) or transiently unreachable —
      // retry within the caller's deadline rather than failing the whole import.
      log.warn("Lease pool connection unavailable; retrying within the wait budget", { datasetId, error });
      await delay(pollIntervalMs);
      continue;
    }
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
      // The lock query's outcome is ambiguous from the client's view; destroy the
      // connection so a possibly-held lock can't linger on a reused pooled session.
      client.release(error instanceof Error ? error : new Error(String(error)));
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
