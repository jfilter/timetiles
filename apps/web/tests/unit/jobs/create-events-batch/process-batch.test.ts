/**
 * Unit tests for how processEventBatch treats failed bulk-insert sub-batches.
 *
 * @module
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as EventCreationHelpers from "@/lib/jobs/utils/event-creation-helpers";

const mocks = vi.hoisted(() => ({ bulkInsertEvents: vi.fn() }));

vi.mock("@/lib/jobs/utils/bulk-event-insert", () => ({ bulkInsertEvents: mocks.bulkInsertEvents }));

vi.mock("@/lib/jobs/utils/event-creation-helpers", async () => {
  const actual = await vi.importActual<typeof EventCreationHelpers>("@/lib/jobs/utils/event-creation-helpers");
  return { ...actual, createEventData: vi.fn((row: { id: string }) => ({ uniqueId: `dataset-1:ext:${row.id}` })) };
});

import { type ProcessBatchContext, processEventBatch } from "@/lib/jobs/handlers/create-events-batch/process-batch";

const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));

const createContext = (): ProcessBatchContext =>
  ({
    payload: {},
    job: { id: 1, duplicates: { internal: [], external: [], summary: {} } },
    dataset: { id: 1 },
    ingestJobId: 1,
    accessFields: { datasetIsPublic: true, catalogOwnerId: null },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }) as unknown as ProcessBatchContext;

describe("processEventBatch bulk insert sub-batch failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws for a retry when a sub-batch hit a transient database error", async () => {
    const lost = Object.assign(new Error("Failed query"), { cause: new Error("Connection terminated unexpectedly") });
    mocks.bulkInsertEvents.mockResolvedValueOnce({
      created: 3,
      failures: [3, 4].map((index) => ({ index, error: lost })),
      conflicts: [],
    });

    await expect(processEventBatch(createContext(), rows, 0)).rejects.toBe(lost);
  });

  it("keeps a data error in a sub-batch as row errors", async () => {
    const invalid = Object.assign(new Error("invalid input syntax"), { code: "22P02" });
    mocks.bulkInsertEvents.mockResolvedValueOnce({
      created: 3,
      failures: [3, 4].map((index) => ({ index, error: invalid })),
      conflicts: [],
    });

    const result = await processEventBatch(createContext(), rows, 10);

    expect(result.eventsCreated).toBe(3);
    expect(result.errors.map((e) => e.row)).toEqual([13, 14]);
  });

  it("rethrows a transient error thrown by the bulk insert itself", async () => {
    const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    mocks.bulkInsertEvents.mockRejectedValueOnce(reset);

    await expect(processEventBatch(createContext(), rows, 0)).rejects.toBe(reset);
  });
});
