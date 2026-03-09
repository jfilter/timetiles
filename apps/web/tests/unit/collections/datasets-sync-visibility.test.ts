/**
 * Unit tests for syncIsPublicToEvents combined visibility logic.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

import { syncIsPublicToEvents } from "@/lib/collections/datasets/hooks";

const createMockContext = (
  doc: { id: number; isPublic?: boolean; catalogIsPublic?: boolean | null },
  previousDoc: { isPublic?: boolean },
  operation: string = "update"
) => {
  const mockUpdate = vi.fn().mockResolvedValue({ docs: [] });
  return {
    doc,
    previousDoc,
    operation,
    req: { payload: { update: mockUpdate } } as any,
    collection: {} as any,
    context: {} as any,
    mockUpdate,
  };
};

describe("syncIsPublicToEvents", () => {
  it("should skip if operation is not update", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true },
      { isPublic: false },
      "create"
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).not.toHaveBeenCalled();
  });

  it("should skip if isPublic did not change", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true },
      { isPublic: true }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).not.toHaveBeenCalled();
  });

  it("should sync true when both dataset and catalog are public", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: true },
      { isPublic: false }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { datasetIsPublic: true },
      })
    );
  });

  it("should sync false when dataset is public but catalog is private", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: false },
      { isPublic: false }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { datasetIsPublic: false },
      })
    );
  });

  it("should sync false when dataset is private regardless of catalog", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: false, catalogIsPublic: true },
      { isPublic: true }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { datasetIsPublic: false },
      })
    );
  });

  it("should treat null catalogIsPublic as false", async () => {
    const ctx = createMockContext(
      { id: 1, isPublic: true, catalogIsPublic: null },
      { isPublic: false }
    );
    await syncIsPublicToEvents(ctx as any);
    expect(ctx.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { datasetIsPublic: false },
      })
    );
  });
});
