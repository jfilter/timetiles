/**
 * Verify Payload serializes archive writers for the same export.
 * @module
 * @category Tests
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/integration/environment";

describe.sequential("Data export job concurrency", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("leaves a second writer pending while the same export is processing", async () => {
    const { payload } = env;
    const first = await payload.jobs.queue({ task: "data-export", input: { exportId: 42 } });
    const second = await payload.jobs.queue({ task: "data-export", input: { exportId: 42 } });
    const unrelated = await payload.jobs.queue({ task: "data-export", input: { exportId: 43 } });
    expect(first.concurrencyKey).toBe("data-export:42");
    expect(second.concurrencyKey).toBe(first.concurrencyKey);
    expect(unrelated.concurrencyKey).not.toBe(first.concurrencyKey);

    await payload.update({ collection: "payload-jobs", id: first.id, data: { processing: true } });
    await payload.jobs.run({ where: { id: { equals: second.id } } });

    const pending = await payload.findByID({ collection: "payload-jobs", id: second.id });
    expect(pending.totalTried ?? 0).toBe(0);
    expect(pending.processing).toBe(false);
    expect(pending.completedAt).toBeFalsy();
  });
});
