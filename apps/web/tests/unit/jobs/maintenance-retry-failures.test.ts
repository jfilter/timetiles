/**
 * Unit tests for maintenance jobs that must throw so Payload can retry them.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRateLimitStore: vi.fn(),
  sweepExpiredPreviews: vi.fn(),
  asSystem: vi.fn((payload: unknown) => payload),
  logError: vi.fn(),
}));

vi.mock("@/lib/ingest/preview-store", () => ({ sweepExpiredPreviews: mocks.sweepExpiredPreviews }));

vi.mock("@/lib/services/rate-limit/factory", () => ({ createRateLimitStore: mocks.createRateLimitStore }));

vi.mock("@/lib/services/system-payload", () => ({ asSystem: mocks.asSystem }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
  logError: mocks.logError,
}));

import { previewCleanupJob } from "@/lib/jobs/handlers/preview-cleanup-job";
import { rateLimitCleanupJob } from "@/lib/jobs/handlers/rate-limit-cleanup-job";
import { schemaMaintenanceJob } from "@/lib/jobs/handlers/schema-maintenance-job";

describe("maintenance job retry behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws preview cleanup failures so Payload retries the job", async () => {
    mocks.sweepExpiredPreviews.mockImplementation(() => {
      throw new Error("preview directory unavailable");
    });

    await expect(previewCleanupJob.handler()).rejects.toThrow("preview directory unavailable");
  });

  it("throws PostgreSQL rate-limit cleanup failures so Payload retries the job", async () => {
    mocks.createRateLimitStore.mockReturnValue({
      backend: "pg",
      store: { cleanup: vi.fn().mockRejectedValue(new Error("counter table unavailable")) },
    });

    await expect(rateLimitCleanupJob.handler({ req: { payload: {} } } as never)).rejects.toThrow(
      "counter table unavailable"
    );
  });

  it("fails preview cleanup when the sweep reports partial errors", async () => {
    mocks.sweepExpiredPreviews.mockReturnValue({ scanned: 4, removed: 2, orphanedRemoved: 1, errors: 1 });

    await expect(previewCleanupJob.handler()).rejects.toThrow("Preview cleanup failed for 1 entries");
  });

  it("completes preview cleanup when the sweep reports no errors", async () => {
    mocks.sweepExpiredPreviews.mockReturnValue({ scanned: 4, removed: 2, orphanedRemoved: 1, errors: 0 });

    await expect(previewCleanupJob.handler()).resolves.toMatchObject({
      output: { success: true, scanned: 4, removed: 2, orphanedRemoved: 1, errors: 0 },
    });
  });

  it("throws schema maintenance setup failures so Payload retries the job", async () => {
    const payload = { find: vi.fn().mockRejectedValue(new Error("datasets table unavailable")) };

    await expect(schemaMaintenanceJob.handler({ req: { payload }, input: {} } as never)).rejects.toThrow(
      "datasets table unavailable"
    );
  });
});
