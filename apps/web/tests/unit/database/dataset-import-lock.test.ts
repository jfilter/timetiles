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

import { beforeEach, describe, expect, it, vi } from "vitest";

import { acquireDatasetImportLease, type LeasePool } from "@/lib/database/dataset-import-lock";

type Log = Parameters<typeof acquireDatasetImportLease>[2];

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Log;

interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

/**
 * Build a mock lease pool whose Nth connection reports `lockedSequence[N]` from
 * `pg_try_advisory_lock` (default false), and returns [] for the unlock query.
 */
const createMockPool = (lockedSequence: boolean[], queryError?: Error) => {
  let connectCount = 0;
  const clients: MockClient[] = [];
  const pool = {
    connect: vi.fn((): Promise<MockClient> => {
      const idx = connectCount++;
      const client: MockClient = {
        query: vi.fn((text: string) => {
          if (queryError) return Promise.reject(queryError);
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
  return { pool: pool as unknown as LeasePool, clients, getConnectCount: () => connectCount };
};

// A fake payload — never used because we always inject a mock pool.
const fakePayload = {} as never;

describe("acquireDatasetImportLease", () => {
  beforeEach(() => vi.clearAllMocks());

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

  it("releases the connection and rethrows if the lock query errors", async () => {
    const boom = new Error("connection reset");
    const { pool, clients } = createMockPool([false], boom);

    await expect(acquireDatasetImportLease(fakePayload, 9, log, { pool })).rejects.toThrow("connection reset");
    expect(clients[0]?.release).toHaveBeenCalledTimes(1);
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
