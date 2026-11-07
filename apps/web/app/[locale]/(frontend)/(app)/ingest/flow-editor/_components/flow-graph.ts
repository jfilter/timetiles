/**
 * Pure graph operations of the flow editor: building the initial nodes and
 * edges from preview data and wizard state, and the node updates that follow
 * a new connection or deleted edges.
 *
 * @module
 * @category Utils
 */
import type { Connection, Edge, Node } from "@xyflow/react";

import { FIELD_MAPPING_STRING_KEYS } from "@/lib/ingest/field-mapping-utils";
import type { SourceColumnNodeData, TargetFieldNodeData, TransformNodeData } from "@/lib/ingest/types/flow-mapping";
import { createSourceNodes, createTargetNodes } from "@/lib/ingest/types/flow-mapping";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { FieldMapping, SheetInfo } from "@/lib/ingest/types/wizard";

type FlowNodeData = SourceColumnNodeData | TargetFieldNodeData | TransformNodeData;

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<{ isValid: boolean; confidence?: number }>;

export const NODE_TYPE_SOURCE = "source-column";
export const NODE_TYPE_TARGET = "target-field";
export const NODE_TYPE_TRANSFORM = "transform";

/** Return a copy of `node` with `isConnected: true` and any extra data fields merged in. */
const markNodeConnected = <T extends FlowNodeData>(node: FlowNode, extra: Partial<T> = {}): FlowNode => ({
  ...node,
  data: { ...(node.data as T), isConnected: true, ...extra },
});

interface MappingPair {
  source: string | null;
  target: string;
  confidence: number;
}

/**
 * Build mapping pairs from suggested mappings
 */
const buildMappingPairs = (mappings: NonNullable<SheetInfo["suggestedMappings"]>["mappings"]): MappingPair[] => [
  { source: mappings.titlePath.path, target: "titleField", confidence: mappings.titlePath.confidence },
  {
    source: mappings.descriptionPath.path,
    target: "descriptionField",
    confidence: mappings.descriptionPath.confidence,
  },
  {
    source: mappings.locationNamePath?.path ?? null,
    target: "locationNameField",
    confidence: mappings.locationNamePath?.confidence ?? 0,
  },
  { source: mappings.timestampPath.path, target: "dateField", confidence: mappings.timestampPath.confidence },
  {
    source: mappings.endTimestampPath?.path ?? null,
    target: "endDateField",
    confidence: mappings.endTimestampPath?.confidence ?? 0,
  },
  { source: mappings.locationPath.path, target: "locationField", confidence: mappings.locationPath.confidence },
  { source: mappings.latitudePath.path, target: "latitudeField", confidence: mappings.latitudePath.confidence },
  { source: mappings.longitudePath.path, target: "longitudeField", confidence: mappings.longitudePath.confidence },
];

/**
 * Create initial edges from mapping pairs
 */
const createInitialEdges = (mappingPairs: MappingPair[], sheetIndex: number): FlowEdge[] => {
  const edges: FlowEdge[] = [];
  for (const mapping of mappingPairs) {
    if (mapping.source && mapping.confidence > 0.5) {
      edges.push({
        id: `edge-${mapping.source}-${mapping.target}`,
        source: `source-${sheetIndex}-${mapping.source}`,
        target: `target-${mapping.target}`,
        data: { isValid: true, confidence: mapping.confidence },
      });
    }
  }
  return edges;
};

/**
 * Create initial edges from the wizard's CURRENT field mapping. This is the
 * authoritative source when present — initializing from auto-suggestions
 * instead silently reverted the user's step-4 edits on "Apply & Return".
 */
const createEdgesFromFieldMapping = (
  fm: FieldMapping,
  sheetIndex: number,
  sourceNodeIds: ReadonlySet<string>
): FlowEdge[] => {
  const edges: FlowEdge[] = [];
  for (const key of FIELD_MAPPING_STRING_KEYS) {
    const source = fm[key];
    if (!source) continue;
    const sourceNodeId = `source-${sheetIndex}-${source}`;
    // Skip stale refs to columns that no longer exist in the sheet
    if (!sourceNodeIds.has(sourceNodeId)) continue;
    edges.push({ id: `edge-${source}-${key}`, source: sourceNodeId, target: `target-${key}`, data: { isValid: true } });
  }
  return edges;
};

/**
 * Create transform nodes and wiring edges from wizard state.
 */
const createTransformNodesFromWizard = (
  wizardState: { fieldMapping: FieldMapping; transforms: IngestTransform[] },
  sheetIndex: number,
  sourceX: number,
  targetX: number
): { nodes: FlowNode[]; edges: FlowEdge[]; replacedTargets: Set<string> } => {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const replacedTargets = new Set<string>();
  const transformX = sourceX + (targetX - sourceX) / 2;

  // Build reverse map: mapped column → target fieldKey. The map is keyed by
  // the value the serializer wrote into the field mapping — for a rename
  // chain that is the rename's `to`, not the source column.
  const columnToTargetField = new Map<string, string>();
  const fm = wizardState.fieldMapping;
  for (const fieldKey of FIELD_MAPPING_STRING_KEYS) {
    const mappedColumn = fm[fieldKey];
    if (mappedColumn) columnToTargetField.set(mappedColumn, fieldKey);
  }

  for (let i = 0; i < wizardState.transforms.length; i++) {
    const transform = wizardState.transforms[i]!;
    const nodeId = `transform-${transform.id}`;
    const y = 50 + i * 120;

    nodes.push({
      id: nodeId,
      type: NODE_TYPE_TRANSFORM,
      position: { x: transformX, y },
      data: { transform, isEditing: false },
    });

    // Wire edges: source → transform → target
    const sourceColumn = "from" in transform ? transform.from : null;
    if (!sourceColumn) continue;

    const sourceNodeId = `source-${sheetIndex}-${sourceColumn}`;
    edges.push({ id: `edge-${sourceNodeId}-${nodeId}`, source: sourceNodeId, target: nodeId, data: { isValid: true } });

    // Mirror the serializer: a rename maps its `to` column into the field
    // mapping, every other transform maps the source column.
    const mappedColumn = transform.type === "rename" && transform.to ? transform.to : sourceColumn;
    const targetFieldKey = columnToTargetField.get(mappedColumn);
    if (targetFieldKey) {
      const targetNodeId = `target-${targetFieldKey}`;
      replacedTargets.add(targetNodeId);
      edges.push({
        id: `edge-${nodeId}-${targetNodeId}`,
        source: nodeId,
        target: targetNodeId,
        data: { isValid: true },
      });
    }
  }

  return { nodes, edges, replacedTargets };
};

/**
 * Build the initial graph for a sheet. The wizard's field mapping and
 * transforms win over the sheet's auto-suggestions when present.
 */
export const buildInitialGraph = (
  sheet: SheetInfo,
  sheetIndex: number,
  wizardFieldMapping: FieldMapping | undefined,
  wizardTransforms: IngestTransform[]
): { nodes: FlowNode[]; edges: FlowEdge[] } => {
  const sourceNodes = createSourceNodes(sheet.headers, sheet.sampleData, sheet.index, sheet.name);
  const targetNodes = createTargetNodes();
  const nodes: FlowNode[] = [...sourceNodes, ...targetNodes];
  let edges: FlowEdge[] = [];

  if (wizardFieldMapping) {
    const sourceNodeIds = new Set(sourceNodes.map((n) => n.id));
    edges = createEdgesFromFieldMapping(wizardFieldMapping, sheetIndex, sourceNodeIds);
  } else if (sheet.suggestedMappings?.mappings) {
    // No wizard state (direct flow-editor access) — fall back to suggestions
    edges = createInitialEdges(buildMappingPairs(sheet.suggestedMappings.mappings), sheetIndex);
  }

  if (wizardFieldMapping && wizardTransforms.length > 0) {
    const result = createTransformNodesFromWizard(
      { fieldMapping: wizardFieldMapping, transforms: wizardTransforms },
      sheetIndex,
      sourceNodes[0]?.position.x ?? 0,
      targetNodes[0]?.position.x ?? 700
    );
    nodes.push(...result.nodes);
    // Remove direct edges that transforms replace, then add transform edges
    edges = [...edges.filter((e) => !result.replacedTargets.has(e.target)), ...result.edges];
  }

  if (edges.length === 0) return { nodes, edges };

  const applyConnectionState = (node: FlowNode): FlowNode => {
    if (node.type === NODE_TYPE_SOURCE) {
      const isConnected = edges.some((e) => e.source === node.id);
      return { ...node, data: { ...(node.data as SourceColumnNodeData), isConnected } };
    }
    if (node.type === NODE_TYPE_TARGET) {
      const edge = edges.find((e) => e.target === node.id);
      const srcNode = edge ? sourceNodes.find((n) => n.id === edge.source) : null;
      return {
        ...node,
        data: {
          ...(node.data as TargetFieldNodeData),
          isConnected: !!edge,
          connectedColumn: srcNode?.data.columnName ?? null,
        },
      };
    }
    return node;
  };
  return { nodes: nodes.map(applyConnectionState), edges };
};

/**
 * Node update for a new connection (source→target, source→transform,
 * transform→target), or null when the connection is not allowed.
 */
export const connectionNodeUpdate = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  params: Connection
): ((node: FlowNode) => FlowNode) | null => {
  const sourceNode = nodes.find((n) => n.id === params.source);
  const targetNode = nodes.find((n) => n.id === params.target);
  if (!sourceNode || !targetNode) return null;

  if (sourceNode.type === NODE_TYPE_SOURCE && targetNode.type === NODE_TYPE_TARGET) {
    const { columnName } = sourceNode.data as SourceColumnNodeData;
    return (node) => {
      if (node.id === params.source) return markNodeConnected<SourceColumnNodeData>(node);
      if (node.id === params.target)
        return markNodeConnected<TargetFieldNodeData>(node, { connectedColumn: columnName });
      return node;
    };
  }

  if (sourceNode.type === NODE_TYPE_SOURCE && targetNode.type === NODE_TYPE_TRANSFORM) {
    return (node) => (node.id === params.source ? markNodeConnected<SourceColumnNodeData>(node) : node);
  }

  if (sourceNode.type === NODE_TYPE_TRANSFORM && targetNode.type === NODE_TYPE_TARGET) {
    // Find the source column upstream of this transform
    const upstreamEdge = edges.find((e) => e.target === sourceNode.id);
    const upstreamNode = upstreamEdge ? nodes.find((n) => n.id === upstreamEdge.source) : null;
    const connectedColumn =
      upstreamNode?.type === NODE_TYPE_SOURCE ? (upstreamNode.data as SourceColumnNodeData).columnName : null;
    return (node) =>
      node.id === params.target ? markNodeConnected<TargetFieldNodeData>(node, { connectedColumn }) : node;
  }

  return null;
};

/** Node update that clears connection state left dangling by deleted edges. */
export const edgeDeletionNodeUpdate = (edges: FlowEdge[], deletedEdges: FlowEdge[]): ((node: FlowNode) => FlowNode) => {
  const deletedIds = new Set(deletedEdges.map((e) => e.id));
  const remainingEdges = edges.filter((e) => !deletedIds.has(e.id));
  const affectedSources = new Set(deletedEdges.map((e) => e.source));
  const affectedTargets = new Set(deletedEdges.map((e) => e.target));
  const connectedSources = new Set(remainingEdges.map((e) => e.source));
  const connectedTargets = new Set(remainingEdges.map((e) => e.target));

  return (node) => {
    if (node.type === NODE_TYPE_SOURCE && affectedSources.has(node.id)) {
      return { ...node, data: { ...(node.data as SourceColumnNodeData), isConnected: connectedSources.has(node.id) } };
    }
    if (node.type === NODE_TYPE_TARGET && affectedTargets.has(node.id)) {
      const stillConnected = connectedTargets.has(node.id);
      return {
        ...node,
        data: {
          ...(node.data as TargetFieldNodeData),
          isConnected: stillConnected,
          connectedColumn: stillConnected ? (node.data as TargetFieldNodeData).connectedColumn : null,
        },
      };
    }
    return node;
  };
};
