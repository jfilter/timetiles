// @vitest-environment jsdom
/**
 * Unit tests for useFlowEditor initialization reset behavior.
 *
 * Verifies that nodes/edges are re-initialized when previewId or sheetIndex
 * changes, preventing stale state when the component instance survives
 * a param change.
 *
 * @module
 * @category Tests
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (must be hoisted before imports) ---

const mockSetNodes = vi.hoisted(() => vi.fn());
const mockSetEdges = vi.hoisted(() => vi.fn());
const mockUsePreviewSheetsQuery = vi.hoisted(() => vi.fn());

vi.mock("@xyflow/react", () => ({
  useNodesState: () => [[], mockSetNodes, vi.fn()],
  useEdgesState: () => [[], mockSetEdges, vi.fn()],
  addEdge: vi.fn((_params, edges) => edges),
}));

vi.mock("@/lib/hooks/use-ingest-wizard-queries", () => ({ usePreviewSheetsQuery: mockUsePreviewSheetsQuery }));

vi.mock("@/lib/ingest/types/flow-mapping", () => ({
  createSourceNodes: (headers: string[], _sampleData: unknown, sheetIndex: number) =>
    headers.map((header) => ({
      id: `source-${sheetIndex}-${header}`,
      type: "source-column",
      data: {},
      position: { x: 0, y: 0 },
    })),
  createTargetNodes: () => [{ id: "tgt-1", type: "target-field", data: {}, position: { x: 0, y: 0 } }],
}));

vi.mock("@/lib/ingest/field-mapping-utils", () => ({
  createEmptyFieldMapping: (sheetIndex: number) => ({ sheetIndex, titleField: null }),
  setMappingField: vi.fn(),
}));

vi.mock("@/lib/ingest/types/transforms", () => ({ createTransform: vi.fn(), isTransformValid: () => false }));

import { useFlowEditor } from "@/app/[locale]/(frontend)/ingest/flow-editor/_components/use-flow-editor";

const makeSheet = (index: number, name: string, headers: string[] = ["title", "date"]) => ({
  index,
  name,
  rowCount: 10,
  headers,
  sampleData: [Object.fromEntries(headers.map((header) => [header, "value"]))],
});

/** Node ids from the most recent `setNodes` call that received a node array. */
const lastInitializedNodeIds = (): string[] => {
  const arrays = mockSetNodes.mock.calls.map(([arg]) => arg as unknown).filter(Array.isArray);
  return (arrays.at(-1) ?? []).map((node: { id: string }) => node.id);
};

describe("useFlowEditor initialization reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize nodes when preview data arrives", () => {
    mockUsePreviewSheetsQuery.mockReturnValue({
      data: { sheets: [makeSheet(0, "Sheet1")] },
      isLoading: false,
      error: null,
    });

    renderHook(() => useFlowEditor("preview-1", 0));

    expect(lastInitializedNodeIds()).toEqual(["source-0-title", "source-0-date", "tgt-1"]);
  });

  it("should re-initialize when sheetIndex changes", () => {
    mockUsePreviewSheetsQuery.mockReturnValue({
      data: { sheets: [makeSheet(0, "Sheet1"), makeSheet(1, "Sheet2", ["venue", "starts"])] },
      isLoading: false,
      error: null,
    });

    const { rerender } = renderHook(({ previewId, sheetIndex }) => useFlowEditor(previewId, sheetIndex), {
      initialProps: { previewId: "preview-1", sheetIndex: 0 },
    });

    expect(lastInitializedNodeIds()).toEqual(["source-0-title", "source-0-date", "tgt-1"]);

    // Change sheetIndex — nodes must be rebuilt from the second sheet's columns
    mockSetNodes.mockClear();
    rerender({ previewId: "preview-1", sheetIndex: 1 });

    expect(lastInitializedNodeIds()).toEqual(["source-1-venue", "source-1-starts", "tgt-1"]);
  });

  it("should re-initialize when previewId changes", () => {
    mockUsePreviewSheetsQuery.mockReturnValue({
      data: { sheets: [makeSheet(0, "Sheet1")] },
      isLoading: false,
      error: null,
    });

    const { rerender } = renderHook(({ previewId, sheetIndex }) => useFlowEditor(previewId, sheetIndex), {
      initialProps: { previewId: "preview-1", sheetIndex: 0 },
    });

    expect(lastInitializedNodeIds()).toEqual(["source-0-title", "source-0-date", "tgt-1"]);

    // Change previewId — nodes must be rebuilt from the new preview's columns
    mockSetNodes.mockClear();
    mockUsePreviewSheetsQuery.mockReturnValue({
      data: { sheets: [makeSheet(0, "NewSheet", ["name"])] },
      isLoading: false,
      error: null,
    });
    rerender({ previewId: "preview-2", sheetIndex: 0 });

    expect(lastInitializedNodeIds()).toEqual(["source-0-name", "tgt-1"]);
  });

  it("should not re-initialize on rerender with same params", () => {
    mockUsePreviewSheetsQuery.mockReturnValue({
      data: { sheets: [makeSheet(0, "Sheet1")] },
      isLoading: false,
      error: null,
    });

    const { rerender } = renderHook(({ previewId, sheetIndex }) => useFlowEditor(previewId, sheetIndex), {
      initialProps: { previewId: "preview-1", sheetIndex: 0 },
    });

    expect(mockSetNodes).toHaveBeenCalled();

    // Re-render with same params — initialization should NOT run again
    mockSetNodes.mockClear();
    rerender({ previewId: "preview-1", sheetIndex: 0 });

    // setNodes should not be called again since hasInitializedRef is still true
    // and the sheet reference hasn't changed
    expect(mockSetNodes).not.toHaveBeenCalled();
  });
});
