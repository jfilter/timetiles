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

import { captureLiveRowBeforeUpdate } from "@/lib/collections/catalog-ownership";
import { syncIsPublicToEvents } from "@/lib/collections/datasets/hooks";

// The hook compares the live rows before and after the write, not previousDoc/doc.
const createMockContext = async (
  doc: { id: number; isPublic?: boolean; catalogIsPublic?: boolean | null; catalogCreatorId?: number | null },
  previousDoc: { isPublic?: boolean; catalogIsPublic?: boolean | null; catalogCreatorId?: number | null },
  operation: string = "update"
) => {
  const mockUpdate = vi.fn().mockResolvedValue({ docs: [] });
  const findOne = vi.fn().mockResolvedValue({ id: doc.id, ...previousDoc });
  const req = { context: {}, payload: { update: mockUpdate, findByID: vi.fn(), db: { findOne } } } as any;
  if (operation === "update") {
    await captureLiveRowBeforeUpdate("datasets")({ data: {}, operation, originalDoc: { id: doc.id }, req } as any);
  }
  findOne.mockResolvedValue(doc);
  return { doc, previousDoc, operation, req, collection: {} as any, context: {} as any, mockUpdate };
};

describe("syncIsPublicToEvents", () => {
  it("should skip if operation is not update", async () => {
    const ctx = await createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true, catalogCreatorId: 1 },
      { isPublic: false, catalogIsPublic: true, catalogCreatorId: 1 },
      "create"
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).not.toHaveBeenCalled();
  });

  it("should skip if access-control fields did not change", async () => {
    const ctx = await createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true, catalogCreatorId: 1 },
      { isPublic: true, catalogIsPublic: true, catalogCreatorId: 1 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).not.toHaveBeenCalled();
  });

  it("should sync true when both dataset and catalog are public", async () => {
    const ctx = await createMockContext(
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
    const ctx = await createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: false, catalogCreatorId: 2 },
      { isPublic: false, catalogIsPublic: false, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: false, catalogOwnerId: 2 } })
    );
  });

  it("should sync false when dataset is private regardless of catalog", async () => {
    const ctx = await createMockContext(
      { id: 1, isPublic: false, catalogIsPublic: true, catalogCreatorId: 2 },
      { isPublic: true, catalogIsPublic: true, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: false, catalogOwnerId: 2 } })
    );
  });

  it("should treat null catalogIsPublic as false", async () => {
    const ctx = await createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: null, catalogCreatorId: 2 },
      { isPublic: false, catalogIsPublic: null, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: false, catalogOwnerId: 2 } })
    );
  });

  it("should resync when catalog visibility changes without an isPublic change", async () => {
    const ctx = await createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: false, catalogCreatorId: 2 },
      { isPublic: true, catalogIsPublic: true, catalogCreatorId: 2 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: false, catalogOwnerId: 2 } })
    );
  });

  it("should resync catalog ownership when the dataset moves catalogs", async () => {
    const ctx = await createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true, catalogCreatorId: 9 },
      { isPublic: true, catalogIsPublic: true, catalogCreatorId: 3 }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "events", data: { datasetIsPublic: true, catalogOwnerId: 9 } })
    );
  });
});
