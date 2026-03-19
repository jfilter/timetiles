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

vi.mock("@/lib/hooks/use-import-wizard-queries", () => ({ usePreviewSheetsQuery: mockUsePreviewSheetsQuery }));

vi.mock("@/lib/types/flow-mapping", () => ({
  createSourceNodes: () => [{ id: "src-1", type: "source-column", data: {}, position: { x: 0, y: 0 } }],
  createTargetNodes: () => [{ id: "tgt-1", type: "target-field", data: {}, position: { x: 0, y: 0 } }],
}));

vi.mock("@/lib/import/field-mapping-utils", () => ({
  createEmptyFieldMapping: (sheetIndex: number) => ({ sheetIndex, titleField: null }),
  setMappingField: vi.fn(),
}));

vi.mock("@/lib/types/import-transforms", () => ({ createTransform: vi.fn(), isTransformValid: () => false }));

import { useFlowEditor } from "@/app/[locale]/(frontend)/import/flow-editor/_components/use-flow-editor";

const makeSheet = (index: number, name: string) => ({
  index,
  name,
  rowCount: 10,
  headers: ["title", "date"],
  sampleData: [{ title: "Test", date: "2025-01-01" }],
});

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

    expect(mockSetNodes).toHaveBeenCalled();
  });

  it("should re-initialize when sheetIndex changes", () => {
    mockUsePreviewSheetsQuery.mockReturnValue({
      data: { sheets: [makeSheet(0, "Sheet1"), makeSheet(1, "Sheet2")] },
      isLoading: false,
      error: null,
    });

    const { rerender } = renderHook(({ previewId, sheetIndex }) => useFlowEditor(previewId, sheetIndex), {
      initialProps: { previewId: "preview-1", sheetIndex: 0 },
    });

    const callsAfterInit = mockSetNodes.mock.calls.length;
    expect(callsAfterInit).toBeGreaterThan(0);

    // Change sheetIndex — should trigger re-initialization
    mockSetNodes.mockClear();
    rerender({ previewId: "preview-1", sheetIndex: 1 });

    expect(mockSetNodes).toHaveBeenCalled();
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

    expect(mockSetNodes).toHaveBeenCalled();

    // Change previewId — return new data (new object reference, simulating fresh query)
    mockSetNodes.mockClear();
    mockUsePreviewSheetsQuery.mockReturnValue({
      data: { sheets: [makeSheet(0, "NewSheet")] },
      isLoading: false,
      error: null,
    });
    rerender({ previewId: "preview-2", sheetIndex: 0 });

    expect(mockSetNodes).toHaveBeenCalled();
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
