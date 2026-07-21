/**
 * Regression tests for the dataset a user may move an event into.
 *
 * The collection's `update` access filters on the event's CURRENT
 * catalogOwnerId, so it decides which events you may touch. It says nothing
 * about the dataset you may point one at, and the `dataset` field carries no
 * access control of its own. Because the beforeChange hook then recomputes
 * catalogOwnerId from whichever dataset it now points at, an unguarded update
 * let a user hand their event to someone else's dataset — writing
 * attacker-controlled rows into a victim's data, and publishing them if that
 * dataset is public.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const quotaMocks = vi.hoisted(() => ({
  checkAndIncrementUsage: vi.fn(),
  decrementUsage: vi.fn(),
  getEffectiveQuotas: vi.fn(),
}));

const ownershipMocks = vi.hoisted(() => ({ safeFetchRecord: vi.fn() }));

vi.mock("@/lib/services/quota-service", () => ({ createQuotaService: vi.fn(() => quotaMocks) }));

vi.mock("@/lib/collections/catalog-ownership", async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogOwnershipModule>()),
  safeFetchRecord: ownershipMocks.safeFetchRecord,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as CatalogOwnershipModule from "@/lib/collections/catalog-ownership";

import { eventsBeforeChangeHook } from "@/lib/collections/events/hooks";

const OWNER_ID = 42;
const OTHER_OWNER_ID = 99;

/** A dataset in a public catalog owned by `ownerId`. */
const datasetOwnedBy = (ownerId: number) => ({
  id: 7,
  isPublic: true,
  catalog: { id: 3, isPublic: true, createdBy: ownerId },
});

const runHook = async (user: { id: number; role: string } | null) =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- hook signature is narrowed by Payload generics the test does not model
  (eventsBeforeChangeHook as (args: unknown) => Promise<unknown>)({
    data: { dataset: 7, title: "injected" },
    operation: "update",
    req: { user, payload: {}, context: {}, t: undefined },
  });

describe("events beforeChange — target dataset ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaMocks.checkAndIncrementUsage.mockResolvedValue(true);
  });

  it("rejects moving an event into a dataset owned by someone else", async () => {
    ownershipMocks.safeFetchRecord.mockResolvedValue(datasetOwnedBy(OTHER_OWNER_ID));

    await expect(runHook({ id: OWNER_ID, role: "user" })).rejects.toThrow();
  });

  it("allows an update that keeps the event in the user's own dataset", async () => {
    ownershipMocks.safeFetchRecord.mockResolvedValue(datasetOwnedBy(OWNER_ID));

    const result = (await runHook({ id: OWNER_ID, role: "user" })) as Record<string, unknown>;

    expect(result.catalogOwnerId).toBe(OWNER_ID);
    expect(result.datasetIsPublic).toBe(true);
  });

  // Editors and admins legitimately curate across catalogs, so the guard must
  // not apply to them.
  it.each(["admin", "editor"])("allows a %s to move an event into any dataset", async (role) => {
    ownershipMocks.safeFetchRecord.mockResolvedValue(datasetOwnedBy(OTHER_OWNER_ID));

    const result = (await runHook({ id: OWNER_ID, role })) as Record<string, unknown>;

    expect(result.catalogOwnerId).toBe(OTHER_OWNER_ID);
  });

  // The import pipeline writes events with no acting user. Blocking that would
  // break every ingest.
  it("allows a system write with no acting user", async () => {
    ownershipMocks.safeFetchRecord.mockResolvedValue(datasetOwnedBy(OTHER_OWNER_ID));

    const result = (await runHook(null)) as Record<string, unknown>;

    expect(result.catalogOwnerId).toBe(OTHER_OWNER_ID);
  });
});
