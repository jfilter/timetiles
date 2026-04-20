/**
 * Custom hook for flow editor state management.
 *
 * Handles loading preview data, managing nodes/edges, and converting
 * flow state back to FieldMapping.
 *
 * @module
 * @category Hooks
 */
"use client";

import { addEdge, type Connection, type Edge, type Node, useEdgesState, useNodesState } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { usePreviewSheetsQuery } from "@/lib/hooks/use-ingest-wizard-queries";
import { createEmptyFieldMapping, setMappingField } from "@/lib/ingest/field-mapping-utils";
import type { SourceColumnNodeData, TargetFieldNodeData, TransformNodeData } from "@/lib/ingest/types/flow-mapping";
import { createSourceNodes, createTargetNodes } from "@/lib/ingest/types/flow-mapping";
import {
  createTransform,
  type IngestTransform,
  isTransformValid,
  type TransformType,
} from "@/lib/ingest/types/transforms";
import type { FieldMapping, SheetInfo } from "@/lib/ingest/types/wizard";

import { useWizardStore } from "../../_components/wizard-store";

type FlowNode = Node<SourceColumnNodeData | TargetFieldNodeData | TransformNodeData>;
type FlowEdge = Edge<{ isValid: boolean; confidence?: number }>;

const NODE_TYPE_SOURCE = "source-column";
const NODE_TYPE_TARGET = "target-field";
const NODE_TYPE_TRANSFORM = "transform";

/** Stable reference for empty transforms array to avoid re-render loops in useEffect. */
const EMPTY_TRANSFORMS: IngestTransform[] = [];

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

    if (!srcNode || !tgtNode) continue;

    const sourceData = srcNode.data as SourceColumnNodeData;
    const targetData = tgtNode.data as TargetFieldNodeData;

    const transform = { ...transformData.transform };
    if ("from" in transform && !transform.from) {
      (transform as { from: string }).from = sourceData.columnName;
    }

    if (!isTransformValid(transform)) continue;

    transforms.push(transform);
    const mappedColumn = transform.type === "rename" ? transform.to : sourceData.columnName;
    setMappingField(mapping, targetData.fieldKey, mappedColumn);
  }

  return transforms;
};

interface MappingPair {
  source: string | null;
  target: string;
  confidence: number;
}

interface FlowEditorResult {
  fieldMapping: FieldMapping;
  transforms: IngestTransform[];
}

interface UseFlowEditorResult {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onNodesChange: ReturnType<typeof useNodesState<FlowNode>>[2];
  onEdgesChange: ReturnType<typeof useEdgesState<FlowEdge>>[2];
  onConnect: (params: Connection) => void;
  onEdgesDelete: (deletedEdges: FlowEdge[]) => void;
  addTransformNode: (type: TransformType, position: { x: number; y: number }) => void;
  isLoading: boolean;
  error: string | null;
  sheetInfo: SheetInfo | null;
  serializeFlowState: () => FlowEditorResult;
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

  // Build reverse map: source column → target fieldKey
  const columnToTargetField = new Map<string, string>();
  const fm = wizardState.fieldMapping;
  const fieldKeys: Array<{ key: string; value: string | null }> = [
    { key: "titleField", value: fm.titleField },
    { key: "dateField", value: fm.dateField },
    { key: "descriptionField", value: fm.descriptionField },
    { key: "locationField", value: fm.locationField },
    { key: "locationNameField", value: fm.locationNameField },
    { key: "latitudeField", value: fm.latitudeField },
    { key: "longitudeField", value: fm.longitudeField },
  ];
  for (const entry of fieldKeys) {
    if (entry.value) columnToTargetField.set(entry.value, entry.key);
  }

  for (let i = 0; i < wizardState.transforms.length; i++) {
    const transform = wizardState.transforms[i]!;
    const nodeId = `transform-${transform.id}`;
    const y = 50 + i * 120;

    nodes.push({
      id: nodeId,
      type: NODE_TYPE_TRANSFORM,
      position: { x: transformX, y },
      data: { transform, isEditing: false } as TransformNodeData,
    });

    // Wire edges: source → transform → target
    const sourceColumn = "from" in transform ? transform.from : null;
    if (!sourceColumn) continue;

    const sourceNodeId = `source-${sheetIndex}-${sourceColumn}`;
    edges.push({ id: `edge-${sourceNodeId}-${nodeId}`, source: sourceNodeId, target: nodeId, data: { isValid: true } });

    const targetFieldKey = columnToTargetField.get(sourceColumn);
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

// eslint-disable-next-line sonarjs/max-lines-per-function -- Complex hook managing flow editor state; splitting would reduce cohesion
export const useFlowEditor = (previewId: string | null, sheetIndex: number): UseFlowEditorResult => {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const hasInitializedRef = useRef(false);
  const initKeyRef = useRef<string | null>(null);

  // Read wizard state from Zustand store
  const wizardFieldMapping = useWizardStore((s) => s.fieldMappings.find((fm) => fm.sheetIndex === sheetIndex));
  const wizardTransforms = useWizardStore((s) => s.transforms[sheetIndex] ?? EMPTY_TRANSFORMS);

  // Reset initialization when preview or sheet changes so nodes/edges are rebuilt
  const initKey = useMemo(() => `${previewId ?? ""}-${sheetIndex}`, [previewId, sheetIndex]);
  useEffect(() => {
    if (initKeyRef.current !== null && initKeyRef.current !== initKey) {
      hasInitializedRef.current = false;
    }
    initKeyRef.current = initKey;
  }, [initKey]);

  // Load preview data via React Query
  const { data: previewData, isLoading: queryLoading, error: queryError } = usePreviewSheetsQuery(previewId);

  // Derive sheet info from query data
  const sheet = previewData?.sheets[sheetIndex] ?? null;

  // Derive loading and error states
  const isLoading = !previewId ? false : queryLoading;
  const error = (() => {
    if (!previewId) return "No preview ID provided. Please start from the import wizard.";
    if (queryError) return queryError instanceof Error ? queryError.message : "Failed to load data";
    if (sheet === null && !queryLoading) return `Sheet ${sheetIndex} not found`;
    return null;
  })();

  // Initialize nodes/edges when preview data arrives (once per query result)
  useEffect(() => {
    if (!sheet || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const sourceNodes = createSourceNodes(sheet.headers, sheet.sampleData, sheet.index, sheet.name);
    const targetNodes = createTargetNodes();
    const allInitNodes: FlowNode[] = [...sourceNodes, ...targetNodes];
    const allInitEdges: FlowEdge[] = [];

    if (sheet.suggestedMappings?.mappings) {
      const mappingPairs = buildMappingPairs(sheet.suggestedMappings.mappings);
      const suggestedEdges = createInitialEdges(mappingPairs, sheetIndex);
      allInitEdges.push(...suggestedEdges);
    }

    // Create transform nodes + edges from wizard state
    if (wizardFieldMapping && wizardTransforms.length > 0) {
      const result = createTransformNodesFromWizard(
        { fieldMapping: wizardFieldMapping, transforms: wizardTransforms },
        sheetIndex,
        sourceNodes[0]?.position.x ?? 0,
        targetNodes[0]?.position.x ?? 700
      );
      allInitNodes.push(...result.nodes);
      // Remove direct edges that transforms replace, then add transform edges
      const filteredEdges = allInitEdges.filter((e) => !result.replacedTargets.has(e.target));
      allInitEdges.length = 0;
      allInitEdges.push(...filteredEdges, ...result.edges);
    }

    setNodes(allInitNodes);
    setEdges(allInitEdges);

    // Update node connection states from edges
    if (allInitEdges.length > 0) {
      const applyConnectionState = (node: FlowNode): FlowNode => {
        if (node.type === NODE_TYPE_SOURCE) {
          const isConnected = allInitEdges.some((e) => e.source === node.id);
          return { ...node, data: { ...(node.data as SourceColumnNodeData), isConnected } } as FlowNode;
        }
        if (node.type === NODE_TYPE_TARGET) {
          const edge = allInitEdges.find((e) => e.target === node.id);
          const srcNode = edge ? sourceNodes.find((n) => n.id === edge.source) : null;
          return {
            ...node,
            data: {
              ...(node.data as TargetFieldNodeData),
              isConnected: !!edge,
              connectedColumn: srcNode?.data.columnName ?? null,
            },
          } as FlowNode;
        }
        return node;
      };
      setNodes((nds) => nds.map(applyConnectionState));
    }
  }, [sheet, sheetIndex, setNodes, setEdges, wizardFieldMapping, wizardTransforms]);

  // Handle new connections (source→target, source→transform, transform→target)
  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (!sourceNode || !targetNode) return;

      const isSourceToTarget = sourceNode.type === NODE_TYPE_SOURCE && targetNode.type === NODE_TYPE_TARGET;
      const isSourceToTransform = sourceNode.type === NODE_TYPE_SOURCE && targetNode.type === NODE_TYPE_TRANSFORM;
      const isTransformToTarget = sourceNode.type === NODE_TYPE_TRANSFORM && targetNode.type === NODE_TYPE_TARGET;

      if (!isSourceToTarget && !isSourceToTransform && !isTransformToTarget) return;

      // Remove existing edges to the same target node
      setEdges((eds) => eds.filter((e) => e.target !== params.target));
      setEdges((eds) =>
        addEdge({ ...params, id: `edge-${params.source}-${params.target}`, data: { isValid: true } }, eds)
      );

      if (isSourceToTarget) {
        const sourceData = sourceNode.data as SourceColumnNodeData;
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === params.source) {
              return { ...node, data: { ...(node.data as SourceColumnNodeData), isConnected: true } } as FlowNode;
            }
            if (node.id === params.target) {
              return {
                ...node,
                data: {
                  ...(node.data as TargetFieldNodeData),
                  isConnected: true,
                  connectedColumn: sourceData.columnName,
                },
              } as FlowNode;
            }
            return node;
          })
        );
      } else if (isSourceToTransform) {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === params.source) {
              return { ...node, data: { ...(node.data as SourceColumnNodeData), isConnected: true } } as FlowNode;
            }
            return node;
          })
        );
      } else if (isTransformToTarget) {
        // Find the source column upstream of this transform
        const upstreamEdge = edges.find((e) => e.target === sourceNode.id);
        const upstreamNode = upstreamEdge ? nodes.find((n) => n.id === upstreamEdge.source) : null;
        const connectedColumn =
          upstreamNode?.type === NODE_TYPE_SOURCE ? (upstreamNode.data as SourceColumnNodeData).columnName : null;

        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === params.target) {
              return {
                ...node,
                data: { ...(node.data as TargetFieldNodeData), isConnected: true, connectedColumn },
              } as FlowNode;
            }
            return node;
          })
        );
      }
    },
    [nodes, edges, setEdges, setNodes]
  );

  // Handle edge deletion — pre-compute sets to avoid stale closure and nested callbacks
  const onEdgesDelete = useCallback(
    (deletedEdges: FlowEdge[]) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id));
      const remainingEdges = edges.filter((e) => !deletedIds.has(e.id));
      const affectedSources = new Set(deletedEdges.map((e) => e.source));
      const affectedTargets = new Set(deletedEdges.map((e) => e.target));
      const connectedSources = new Set(remainingEdges.map((e) => e.source));
      const connectedTargets = new Set(remainingEdges.map((e) => e.target));

      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === NODE_TYPE_SOURCE && affectedSources.has(node.id)) {
            return {
              ...node,
              data: { ...(node.data as SourceColumnNodeData), isConnected: connectedSources.has(node.id) },
            } as FlowNode;
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
            } as FlowNode;
          }
          return node;
        })
      );
    },
    [edges, setNodes]
  );

  // Add a new transform node at the specified position
  const addTransformNode = useCallback(
    (type: TransformType, position: { x: number; y: number }) => {
      const transform = createTransform(type);
      const newNode: FlowNode = {
        id: `transform-${transform.id}`,
        type: NODE_TYPE_TRANSFORM,
        position,
        data: { transform, isEditing: false } as TransformNodeData,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  // Convert flow state to FieldMapping + IngestTransforms
  const serializeFlowState = useCallback((): FlowEditorResult => {
    const mapping: FieldMapping = createEmptyFieldMapping(sheetIndex);

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
  }, [nodes, edges, sheetIndex]);

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onEdgesDelete,
    addTransformNode,
    isLoading,
    error,
    sheetInfo: sheet,
    serializeFlowState,
  };
};
