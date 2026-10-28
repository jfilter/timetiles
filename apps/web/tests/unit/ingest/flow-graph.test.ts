/**
 * Unit tests for the flow editor's pure graph operations and serialization.
 *
 * The round trip wizard state → graph → wizard state must be lossless, or
 * opening the visual editor and pressing "Apply" silently changes a mapping.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  buildInitialGraph,
  connectionNodeUpdate,
  edgeDeletionNodeUpdate,
  type FlowNode,
} from "@/app/[locale]/(frontend)/ingest/flow-editor/_components/flow-graph";
import { serializeFlow } from "@/app/[locale]/(frontend)/ingest/flow-editor/_components/flow-serialization";
import { createEmptyFieldMapping } from "@/lib/ingest/field-mapping-utils";
import type { TargetFieldNodeData } from "@/lib/ingest/types/flow-mapping";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { FieldMapping, SheetInfo } from "@/lib/ingest/types/wizard";

const sheet: SheetInfo = {
  index: 0,
  name: "Sheet1",
  rowCount: 2,
  headers: ["name", "when", "city"],
  sampleData: [{ name: "Concert", when: "2026-01-01", city: "Bonn" }],
};

const mapping = (overrides: Partial<FieldMapping>): FieldMapping => ({ ...createEmptyFieldMapping(0), ...overrides });

const rename = (overrides: Partial<Extract<IngestTransform, { type: "rename" }>> = {}): IngestTransform => ({
  id: "t1",
  type: "rename",
  active: true,
  autoDetected: false,
  from: "when",
  to: "start",
  ...overrides,
});

const targetData = (nodes: FlowNode[], fieldKey: string) =>
  nodes.find((n) => n.id === `target-${fieldKey}`)?.data as TargetFieldNodeData;

describe("flow graph round trip", () => {
  it("restores the wizard's field mapping and transforms unchanged", () => {
    const fieldMapping = mapping({ titleField: "name", dateField: "start", idStrategy: "external", idField: "name" });
    const transforms = [rename()];

    const graph = buildInitialGraph(sheet, 0, fieldMapping, transforms);
    const result = serializeFlow(graph.nodes, graph.edges, 0, fieldMapping);

    expect(result.fieldMapping).toEqual(fieldMapping);
    expect(result.transforms).toEqual(transforms);
  });

  it("routes a renamed column through its transform instead of a direct edge", () => {
    const graph = buildInitialGraph(sheet, 0, mapping({ dateField: "start" }), [rename()]);

    expect(graph.edges.map((e) => [e.source, e.target])).toEqual([
      ["source-0-when", "transform-t1"],
      ["transform-t1", "target-dateField"],
    ]);
  });

  it("drops mapping references to columns the sheet no longer has", () => {
    const graph = buildInitialGraph(sheet, 0, mapping({ titleField: "gone", locationNameField: "city" }), []);

    expect(graph.edges.map((e) => e.target)).toEqual(["target-locationNameField"]);
    expect(targetData(graph.nodes, "locationNameField")).toMatchObject({ isConnected: true, connectedColumn: "city" });
    expect(targetData(graph.nodes, "titleField")).toMatchObject({ isConnected: false, connectedColumn: null });
  });

  it("keeps an active transform without a target and drops an inactive one", () => {
    const fieldMapping = mapping({});
    const transforms = [rename(), rename({ id: "t2", from: "city", to: "town", active: false })];

    const graph = buildInitialGraph(sheet, 0, fieldMapping, transforms);
    const result = serializeFlow(graph.nodes, graph.edges, 0, fieldMapping);

    expect(result.transforms.map((t) => t.id)).toEqual(["t1"]);
    expect(result.fieldMapping).toEqual(fieldMapping);
  });
});

describe("connectionNodeUpdate", () => {
  const { nodes } = buildInitialGraph(sheet, 0, mapping({}), []);

  it("rejects a connection from a target back to a source", () => {
    const params = { source: "target-titleField", target: "source-0-name", sourceHandle: null, targetHandle: null };
    expect(connectionNodeUpdate(nodes, [], params)).toBeNull();
  });

  it("marks both ends of a source→target connection", () => {
    const update = connectionNodeUpdate(nodes, [], {
      source: "source-0-name",
      target: "target-titleField",
      sourceHandle: null,
      targetHandle: null,
    });

    const updated = nodes.map(update!);
    expect(targetData(updated, "titleField")).toMatchObject({ isConnected: true, connectedColumn: "name" });
    expect(updated.find((n) => n.id === "source-0-name")?.data).toMatchObject({ isConnected: true });
  });
});

describe("edgeDeletionNodeUpdate", () => {
  it("clears the target's column once its only edge is deleted", () => {
    const graph = buildInitialGraph(sheet, 0, mapping({ titleField: "name" }), []);

    const updated = graph.nodes.map(edgeDeletionNodeUpdate(graph.edges, graph.edges));

    expect(targetData(updated, "titleField")).toMatchObject({ isConnected: false, connectedColumn: null });
    expect(updated.find((n) => n.id === "source-0-name")?.data).toMatchObject({ isConnected: false });
  });
});
