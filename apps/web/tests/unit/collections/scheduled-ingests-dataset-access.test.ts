/**
 * Unit tests for the scheduled-ingests dataset ownership gate.
 *
 * `dataset` and `multiSheetConfig.sheets[].dataset` are plain writable relationships, so
 * without this gate a schedule owner could retarget their schedule at a stranger's dataset
 * and have the cron write rows into it on every run.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

vi.mock("@/lib/services/quota-service", () => ({
  createQuotaService: vi.fn(() => ({
    checkQuota: vi.fn().mockResolvedValue({ allowed: true, remaining: 1, limit: 1 }),
    checkAndIncrementUsage: vi.fn().mockResolvedValue(true),
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    decrementUsage: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/lib/services/audit-log-service", () => ({ AUDIT_ACTIONS: {}, auditLog: vi.fn() }));

import { describe, expect, it, vi } from "vitest";

import ScheduledIngests from "@/lib/collections/scheduled-ingests";

const OWNER_ID = 42;
const STRANGER_ID = 99;

const beforeValidateHook = ScheduledIngests.hooks?.beforeValidate?.[0];

if (!beforeValidateHook) {
  throw new Error("scheduled ingest beforeValidate hook is not configured");
}

/** Payload stub: dataset 7 lives in catalog 3, dataset 8 in catalog 4 (public, stranger-owned). */
const createPayload = (catalogOwner: number) => ({
  findByID: vi.fn(({ collection, id }: { collection: string; id: number }) => {
    if (collection === "datasets") return Promise.resolve({ id, catalog: id === 8 ? 4 : 3 });
    return Promise.resolve(
      id === 4 ? { id: 4, createdBy: STRANGER_ID, isPublic: true } : { id: 3, createdBy: catalogOwner, isPublic: false }
    );
  }),
});

const runHook = (user: { id: number; role: string } | null, catalogOwner: number, data: Record<string, unknown>) =>
  beforeValidateHook({
    data,
    operation: "update",
    req: { user, payload: createPayload(catalogOwner), context: {} },
  } as never);

describe.sequential("scheduled-ingests dataset ownership gate", () => {
  it("rejects a dataset in someone else's catalog", async () => {
    await expect(runHook({ id: OWNER_ID, role: "user" }, STRANGER_ID, { dataset: 7 })).rejects.toThrow(/permission/i);
  });

  it("rejects with 403, not a generic 500", async () => {
    await expect(runHook({ id: OWNER_ID, role: "user" }, STRANGER_ID, { dataset: 7 })).rejects.toMatchObject({
      status: 403,
    });
  });

  // Naming an existing dataset is a targeted write — a public catalog does not grant it.
  it("rejects a public catalog owned by someone else", async () => {
    await expect(runHook({ id: OWNER_ID, role: "user" }, OWNER_ID, { dataset: 8 })).rejects.toThrow(/permission/i);
  });

  it("rejects a stranger's dataset referenced from multiSheetConfig", async () => {
    await expect(
      runHook({ id: OWNER_ID, role: "user" }, STRANGER_ID, { multiSheetConfig: { sheets: [{ dataset: 7 }] } })
    ).rejects.toThrow(/permission/i);
  });

  it("allows a dataset in the user's own catalog", async () => {
    await expect(runHook({ id: OWNER_ID, role: "user" }, OWNER_ID, { dataset: 7 })).resolves.toBeDefined();
  });

  it.each(["admin", "editor"])("allows a %s to target any dataset", async (role) => {
    await expect(runHook({ id: OWNER_ID, role }, STRANGER_ID, { dataset: 7 })).resolves.toBeDefined();
  });

  it("allows a system write with no acting user", async () => {
    await expect(runHook(null, STRANGER_ID, { dataset: 7 })).resolves.toBeDefined();
  });

  it("shares the caller's transaction on every lookup", async () => {
    const payload = createPayload(OWNER_ID);
    const req = { user: { id: OWNER_ID, role: "user" }, payload, context: {} };

    await beforeValidateHook({ data: { dataset: 7 }, operation: "update", req } as never);

    expect(payload.findByID).toHaveBeenCalledTimes(2);
    for (const call of payload.findByID.mock.calls) {
      expect(call[0]).toMatchObject({ req });
    }
  });
});
