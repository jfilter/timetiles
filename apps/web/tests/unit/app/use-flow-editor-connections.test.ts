// @vitest-environment jsdom
/**
 * Unit tests for useFlowEditor's connection handling on real React Flow state.
 *
 * @module
 * @category Tests
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initialState } from "@/app/[locale]/(frontend)/ingest/_components/wizard-state";
import { useWizardStore } from "@/app/[locale]/(frontend)/ingest/_components/wizard-store";
import { useFlowEditor } from "@/app/[locale]/(frontend)/ingest/flow-editor/_components/use-flow-editor";
import { createEmptyFieldMapping } from "@/lib/ingest/field-mapping-utils";
import type { TargetFieldNodeData } from "@/lib/ingest/types/flow-mapping";

const mockUsePreviewSheetsQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-ingest-wizard-queries", () => ({ usePreviewSheetsQuery: mockUsePreviewSheetsQuery }));

const sheet = {
  index: 0,
  name: "Sheet1",
  rowCount: 1,
  headers: ["name", "label"],
  sampleData: [{ name: "Concert", label: "Gig" }],
};

const connect = (source: string, target: string) => ({ source, target, sourceHandle: null, targetHandle: null });

const renderEditor = () => {
  mockUsePreviewSheetsQuery.mockReturnValue({ data: { sheets: [sheet] }, isLoading: false, error: null });
  useWizardStore.setState({ fieldMappings: [{ ...createEmptyFieldMapping(0), titleField: "name" }] });
  return renderHook(() => useFlowEditor("preview-1", 0));
};

const targetData = (nodes: { id: string; data: unknown }[], fieldKey: string) =>
  nodes.find((n) => n.id === `target-${fieldKey}`)?.data as TargetFieldNodeData;

afterEach(() => {
  useWizardStore.setState({ ...initialState, _initialized: false, _savedAt: 0 });
});

describe("useFlowEditor connections", () => {
  it("replaces the edge into a target that is connected again", () => {
    const { result } = renderEditor();
    expect(result.current.edges.map((e) => e.source)).toEqual(["source-0-name"]);

    act(() => result.current.onConnect(connect("source-0-label", "target-titleField")));

    expect(result.current.edges.map((e) => [e.source, e.target])).toEqual([["source-0-label", "target-titleField"]]);
    expect(targetData(result.current.nodes, "titleField")).toMatchObject({ connectedColumn: "label" });
    expect(result.current.serializeFlowState().fieldMapping.titleField).toBe("label");
  });

  it("ignores a connection the graph does not allow", () => {
    const { result } = renderEditor();
    const before = result.current.edges;

    act(() => result.current.onConnect(connect("target-titleField", "source-0-label")));

    expect(result.current.edges).toBe(before);
  });

  it("clears the target once its edge is deleted", () => {
    const { result } = renderEditor();

    act(() => result.current.onEdgesDelete(result.current.edges));

    expect(targetData(result.current.nodes, "titleField")).toMatchObject({ isConnected: false, connectedColumn: null });
  });

  it("adds a transform node at the given position", () => {
    const { result } = renderEditor();

    act(() => result.current.addTransformNode("rename", { x: 10, y: 20 }));

    const added = result.current.nodes.at(-1);
    expect(added).toMatchObject({ type: "transform", position: { x: 10, y: 20 } });
    expect(added?.data).toMatchObject({ transform: { type: "rename" }, isEditing: false });
  });
});
