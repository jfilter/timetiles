/**
 * Unit tests for syncIsPublicToEvents combined visibility logic.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/audit-log-service", () => ({
  AUDIT_ACTIONS: { DATASET_VISIBILITY_CHANGED: "data.dataset_visibility_changed" },
  auditLog: vi.fn(),
}));

vi.mock("@/lib/utils/relation-id", () => ({ extractRelationId: vi.fn(() => null) }));

import { syncIsPublicToEvents } from "@/lib/collections/datasets/hooks";

const createMockContext = (
  doc: { id: number; isPublic?: boolean; catalogIsPublic?: boolean | null; catalogCreatorId?: number | null },
  previousDoc: { isPublic?: boolean; catalogIsPublic?: boolean | null; catalogCreatorId?: number | null },
  operation: string = "update"
) => {
  const mockUpdate = vi.fn().mockResolvedValue({ docs: [] });
  return {
    doc,
    previousDoc,
    operation,
    req: { payload: { update: mockUpdate, findByID: vi.fn() } } as any,
    collection: {} as any,
    context: {} as any,
    mockUpdate,
  };
};

describe("syncIsPublicToEvents", () => {
  it("should skip if operation is not update", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true, catalogCreatorId: 1 },
      { isPublic: false, catalogIsPublic: true, catalogCreatorId: 1 },
      "create"
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).not.toHaveBeenCalled();
  });

  it("should skip if access-control fields did not change", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true, catalogCreatorId: 1 },
      { isPublic: true, catalogIsPublic: true, catalogCreatorId: 1 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).not.toHaveBeenCalled();
  });

  it("should sync true when both dataset and catalog are public", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true, catalogCreatorId: 2 },
      { isPublic: false, catalogIsPublic: true, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: true, catalogOwnerId: 2 } })
    );
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "dataset-schemas", data: { datasetIsPublic: true, catalogOwnerId: 2 } })
    );
  });

  it("should sync false when dataset is public but catalog is private", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: false, catalogCreatorId: 2 },
      { isPublic: false, catalogIsPublic: false, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: false, catalogOwnerId: 2 } })
    );
  });

  it("should sync false when dataset is private regardless of catalog", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: false, catalogIsPublic: true, catalogCreatorId: 2 },
      { isPublic: true, catalogIsPublic: true, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: false, catalogOwnerId: 2 } })
    );
  });

  it("should treat null catalogIsPublic as false", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: null, catalogCreatorId: 2 },
      { isPublic: false, catalogIsPublic: null, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: false, catalogOwnerId: 2 } })
    );
  });

  it("should resync when catalog visibility changes without an isPublic change", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: false, catalogCreatorId: 2 },
      { isPublic: true, catalogIsPublic: true, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: false, catalogOwnerId: 2 } })
    );
  });

  it("should resync catalog ownership when the dataset moves catalogs", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true, catalogCreatorId: 9 },
      { isPublic: true, catalogIsPublic: true, catalogCreatorId: 3 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: true, catalogOwnerId: 9 } })
    );
  });
});
