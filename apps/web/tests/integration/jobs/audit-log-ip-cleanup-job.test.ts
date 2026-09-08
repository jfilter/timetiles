/**
 * Verifies IP retention cleanup retries without modifying audit hashes.
 * @module
 * @category Tests
 */
import { sql } from "@payloadcms/db-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/integration/environment";

describe.sequential("Audit IP cleanup retries", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("retries blocked IP removal while preserving hashes and completed work", async () => {
    const { payload } = env;
    const entries = [];
    for (const action of ["test.blocked", "test.removable"]) {
      entries.push(
        await payload.create({
          collection: "audit-log",
          data: {
            action,
            userId: 1,
            userEmailHash: "test-email-hash",
            timestamp: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
            ipAddress: "192.0.2.1",
            ipAddressHash: "test-ip-hash",
          },
        })
      );
    }
    const blocked = entries[0]!;
    const removable = entries[1]!;
    const job = await payload.jobs.queue({ task: "audit-log-ip-cleanup", queue: "maintenance", input: {} });

    // Real database failure, scoped to this worker database and removed even on assertion failure.
    await payload.db.drizzle.execute(sql`ALTER TABLE payload.audit_log ADD CONSTRAINT audit_ip_cleanup_test
      CHECK (id <> ${sql.raw(String(blocked.id))} OR ip_address IS NOT NULL) NOT VALID`);
    let completedAt: string;
    try {
      await payload.jobs.run({ queue: "maintenance", where: { id: { equals: job.id } } });
      const failed = await payload.findByID({ collection: "audit-log", id: blocked.id });
      const cleared = await payload.findByID({ collection: "audit-log", id: removable.id });
      expect(failed.ipAddress).toBe(blocked.ipAddress);
      expect(cleared.ipAddress).toBeNull();
      completedAt = cleared.updatedAt;
      const retrying = await payload.findByID({ collection: "payload-jobs", id: job.id });
      expect(retrying.totalTried).toBe(1);
      expect(retrying.hasError).toBe(false);
      expect(retrying.completedAt).toBeFalsy();
    } finally {
      await payload.db.drizzle.execute(sql`ALTER TABLE payload.audit_log DROP CONSTRAINT audit_ip_cleanup_test`);
    }

    await payload.jobs.run({ queue: "maintenance", where: { id: { equals: job.id } } });
    for (const entry of entries) {
      const cleared = await payload.findByID({ collection: "audit-log", id: entry.id });
      expect(cleared.ipAddress).toBeNull();
      expect(cleared.ipAddressHash).toBe(entry.ipAddressHash);
      expect(cleared.userEmailHash).toBe(entry.userEmailHash);
      expect(cleared.action).toBe(entry.action);
      expect(cleared.timestamp).toBe(entry.timestamp);
      if (entry.id === removable.id) expect(cleared.updatedAt).toBe(completedAt);
    }
    expect((await payload.count({ collection: "payload-jobs", where: { id: { equals: job.id } } })).totalDocs).toBe(0);
  });
});
