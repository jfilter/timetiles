/**
 * Unit tests for the per-dataset import lease (advisory-lock serialization).
 *
 * Verifies the acquire/poll/timeout/release logic against a mock pool, so no
 * real Postgres is needed. The dedicated-pool + try-lock + backoff design is what
 * keeps concurrent update-strategy imports from deadlocking the work pool.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

import { acquireDatasetImportLease, type LeasePool } from "@/lib/database/dataset-import-lock";

type Log = Parameters<typeof acquireDatasetImportLease>[2];

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Log;

interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

interface MockPoolOptions {
  /** Reject every query (except unlock) — simulates an ambiguous lock query. */
  queryError?: Error;
  /** Reject the unlock query — should trigger connection destruction. */
  unlockError?: Error;
  /** Reject the first N connect() calls — simulates a fully checked-out pool. */
  connectFailUntil?: number;
}

/**
 * Build a mock lease pool whose Nth *successful* connection reports
 * `lockedSequence[N]` from `pg_try_advisory_lock` (default false).
 */
const createMockPool = (lockedSequence: boolean[], opts: MockPoolOptions = {}) => {
  let connectAttempts = 0;
  let acquiredCount = 0;
  const clients: MockClient[] = [];
  const pool = {
    connect: vi.fn((): Promise<MockClient> => {
      const attempt = connectAttempts++;
      if (opts.connectFailUntil && attempt < opts.connectFailUntil) {
        return Promise.reject(new Error("connect timeout"));
      }
      const idx = acquiredCount++;
      const client: MockClient = {
        query: vi.fn((text: string) => {
          if (text.includes("pg_advisory_unlock")) {
            return opts.unlockError ? Promise.reject(opts.unlockError) : Promise.resolve({ rows: [] });
          }
          if (opts.queryError) return Promise.reject(opts.queryError);
          if (text.includes("pg_try_advisory_lock")) {
            return Promise.resolve({ rows: [{ locked: lockedSequence[idx] ?? false }] });
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      clients.push(client);
      return Promise.resolve(client);
    }),
  };
  return {
    pool: pool as unknown as LeasePool,
    clients,
    getConnectCount: () => acquiredCount,
    getConnectAttempts: () => connectAttempts,
  };
};

// A fake payload — never used because we always inject a mock pool.
const fakePayload = {} as never;

// NOTE: no vi.clearAllMocks() in a beforeEach here. Tests in this file run
// concurrently (sequence.concurrent), and a global clear fired by one test's
// hook would wipe the call records of another test mid-poll. Each test owns its
// mock pool with fresh spies, so there is nothing shared to clear.
describe("acquireDatasetImportLease", () => {
  it("acquires immediately when the lock is free and holds the connection", async () => {
    const { pool, clients, getConnectCount } = createMockPool([true]);

    const lease = await acquireDatasetImportLease(fakePayload, 42, log, { pool });

    expect(getConnectCount()).toBe(1);
    // The winning connection is held (not released) until the lease is released.
    expect(clients[0]?.release).not.toHaveBeenCalled();

    await lease.release();
    expect(clients[0]?.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_unlock"), [
      expect.any(String),
      42,
    ]);
    expect(clients[0]?.release).toHaveBeenCalledTimes(1);
  });

  it("polls with backoff and releases losing connections until the lock frees", async () => {
    const { pool, clients, getConnectCount } = createMockPool([false, false, true]);

    const lease = await acquireDatasetImportLease(fakePayload, 7, log, { pool, pollIntervalMs: 1, maxWaitMs: 1000 });

    expect(getConnectCount()).toBe(3);
    // The two losing connections were returned to the pool; the winner is held.
    expect(clients[0]?.release).toHaveBeenCalledTimes(1);
    expect(clients[1]?.release).toHaveBeenCalledTimes(1);
    expect(clients[2]?.release).not.toHaveBeenCalled();

    await lease.release();
    expect(clients[2]?.release).toHaveBeenCalledTimes(1);
  });

  it("throws after maxWaitMs and leaves no connection held", async () => {
    const { pool, clients } = createMockPool([]); // never acquired

    await expect(
      acquireDatasetImportLease(fakePayload, 5, log, { pool, pollIntervalMs: 1, maxWaitMs: 20 })
    ).rejects.toThrow(/Timed out.*dataset 5/);

    // Every attempted connection was released (none leaked).
    for (const client of clients) expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("destroys the connection and rethrows if the lock query errors", async () => {
    const boom = new Error("connection reset");
    const { pool, clients } = createMockPool([false], { queryError: boom });

    await expect(acquireDatasetImportLease(fakePayload, 9, log, { pool })).rejects.toThrow("connection reset");
    // Destroyed, not returned to the pool: release called WITH the error.
    expect(clients[0]?.release).toHaveBeenCalledWith(boom);
  });

  it("destroys the connection when the unlock query fails on release", async () => {
    const unlockBoom = new Error("unlock failed");
    const { pool, clients } = createMockPool([true], { unlockError: unlockBoom });

    const lease = await acquireDatasetImportLease(fakePayload, 3, log, { pool });
    await lease.release();

    // Unlock rejected → destroy the session (release called with an Error), not a plain return.
    expect(clients[0]?.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("retries connect() failures within the wait budget, then acquires", async () => {
    // First two connect() attempts fail; the third succeeds and gets the lock.
    const { pool, getConnectCount, getConnectAttempts } = createMockPool([true], { connectFailUntil: 2 });

    const lease = await acquireDatasetImportLease(fakePayload, 11, log, { pool, pollIntervalMs: 1, maxWaitMs: 1000 });

    expect(getConnectAttempts()).toBe(3); // two failures + one success
    expect(getConnectCount()).toBe(1);
    await lease.release();
  });

  it("release() is idempotent", async () => {
    const { pool, clients } = createMockPool([true]);

    const lease = await acquireDatasetImportLease(fakePayload, 1, log, { pool });
    await lease.release();
    await lease.release();

    // Unlock query + connection release each happen exactly once.
    const unlockCalls = clients[0]?.query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes("pg_advisory_unlock")
    );
    expect(unlockCalls).toHaveLength(1);
    expect(clients[0]?.release).toHaveBeenCalledTimes(1);
  });
});
