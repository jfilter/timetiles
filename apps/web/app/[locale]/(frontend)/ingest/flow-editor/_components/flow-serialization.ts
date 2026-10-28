/**
 * Converts the flow editor graph back into the wizard's FieldMapping and
 * IngestTransforms.
 *
 * @module
 * @category Utils
 */
import { createEmptyFieldMapping, setMappingField } from "@/lib/ingest/field-mapping-utils";
import type { SourceColumnNodeData, TargetFieldNodeData, TransformNodeData } from "@/lib/ingest/types/flow-mapping";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { FieldMapping } from "@/lib/ingest/types/wizard";

import { type FlowEdge, type FlowNode, NODE_TYPE_SOURCE, NODE_TYPE_TARGET, NODE_TYPE_TRANSFORM } from "./flow-graph";

export interface FlowEditorResult {
  fieldMapping: FieldMapping;
  transforms: IngestTransform[];
}

/**
 * Process transform chains (source→transform→target) and collect valid transforms
 */
const collectTransformChains = (nodes: FlowNode[], edges: FlowEdge[], mapping: FieldMapping): IngestTransform[] => {
  const transforms: IngestTransform[] = [];
  const transformNodes = nodes.filter((n) => n.type === NODE_TYPE_TRANSFORM);

  for (const tNode of transformNodes) {
    const transformData = tNode.data as TransformNodeData;
    if (!transformData.transform.active) continue;

    const incomingEdge = edges.find((e) => e.target === tNode.id);
    const srcNode = incomingEdge
      ? nodes.find((n) => n.id === incomingEdge.source && n.type === NODE_TYPE_SOURCE)
      : null;

    const outgoingEdge = edges.find((e) => e.source === tNode.id);
    const tgtNode = outgoingEdge
      ? nodes.find((n) => n.id === outgoingEdge.target && n.type === NODE_TYPE_TARGET)
      : null;

    // A transform only needs a SOURCE to be meaningful (e.g. a rename or
    // string-op on a column imported as-is) — dropping target-less chains
    // silently deleted such transforms on every save.
    if (!srcNode) continue;

    const sourceData = srcNode.data as SourceColumnNodeData;

    const transform = { ...transformData.transform };
    if ("from" in transform && !transform.from) {
      (transform as { from: string }).from = sourceData.columnName;
    }

    // Incomplete transforms are kept, not dropped: the wizard flags them as
    // invalid and lets the user finish configuring them, so discarding them
    // here silently deleted in-progress work on every visual-editor round trip.
    transforms.push(transform);
    if (tgtNode) {
      const targetData = tgtNode.data as TargetFieldNodeData;
      const mappedColumn = transform.type === "rename" ? transform.to : sourceData.columnName;
      // An unfinished rename has no target name yet — never write an empty mapping.
      if (mappedColumn) setMappingField(mapping, targetData.fieldKey, mappedColumn);
    }
  }

  return transforms;
};

/** Convert flow state to FieldMapping + IngestTransforms. */
export const serializeFlow = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  sheetIndex: number,
  wizardFieldMapping: FieldMapping | undefined
): FlowEditorResult => {
  // idStrategy/idField have no graph representation — preserve the wizard's
  // values instead of resetting an "external ID" config to content-hash.
  const mapping: FieldMapping = {
    ...createEmptyFieldMapping(sheetIndex),
    idStrategy: wizardFieldMapping?.idStrategy ?? "content-hash",
    idField: wizardFieldMapping?.idField ?? null,
  };

  // Process direct source→target edges
  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    if (sourceNode?.type === NODE_TYPE_SOURCE && targetNode?.type === NODE_TYPE_TARGET) {
      const sourceData = sourceNode.data as SourceColumnNodeData;
      const targetData = targetNode.data as TargetFieldNodeData;
      setMappingField(mapping, targetData.fieldKey, sourceData.columnName);
    }
  }

  // Process transform chains: source→transform→target
  const transforms = collectTransformChains(nodes, edges, mapping);

  return { fieldMapping: mapping, transforms };
};
