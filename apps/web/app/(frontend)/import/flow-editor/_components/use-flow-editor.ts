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
import { useCallback, useEffect, useState } from "react";

import type { SourceColumnNodeData, TargetFieldNodeData, TransformNodeData } from "@/lib/types/flow-mapping";
import { createSourceNodes, createTargetNodes, TARGET_FIELD_DEFINITIONS } from "@/lib/types/flow-mapping";
import {
  createTransform,
  type ImportTransform,
  isTransformValid,
  type TransformType,
} from "@/lib/types/import-transforms";
import type { FieldMapping, SheetInfo } from "@/lib/types/import-wizard";

type FlowNode = Node<SourceColumnNodeData | TargetFieldNodeData | TransformNodeData>;
type FlowEdge = Edge<{ isValid: boolean; confidence?: number }>;

interface MappingPair {
  source: string | null;
  target: string;
  confidence: number;
}

interface FlowEditorResult {
  fieldMapping: FieldMapping;
  transforms: ImportTransform[];
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

// eslint-disable-next-line sonarjs/max-lines-per-function -- Complex hook managing flow editor state; splitting would reduce cohesion
export const useFlowEditor = (previewId: string | null, sheetIndex: number): UseFlowEditorResult => {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetInfo, setSheetInfo] = useState<SheetInfo | null>(null);

  // Load preview data
  useEffect(() => {
    if (!previewId) {
      setError("No preview ID provided. Please start from the import wizard.");
      setIsLoading(false);
      return;
    }

    const loadPreviewData = async () => {
      try {
        const response = await fetch(`/api/import/preview-schema?previewId=${previewId}`);
        if (!response.ok) throw new Error("Failed to load preview data");

        const data = await response.json();
        const sheets = data.sheets as SheetInfo[];
        const sheet = sheets[sheetIndex];

        if (!sheet) throw new Error(`Sheet ${sheetIndex} not found`);

        setSheetInfo(sheet);

        const sourceNodes = createSourceNodes(sheet.headers, sheet.sampleData, sheet.index, sheet.name);
        const targetNodes = createTargetNodes();
        setNodes([...sourceNodes, ...targetNodes] as FlowNode[]);

        if (sheet.suggestedMappings?.mappings) {
          const mappingPairs = buildMappingPairs(sheet.suggestedMappings.mappings);
          const initialEdges = createInitialEdges(mappingPairs, sheetIndex);
          setEdges(initialEdges);

          // Update node connection states
          setNodes((nds) =>
            // eslint-disable-next-line sonarjs/no-nested-functions -- Callback required by React state setter pattern
            nds.map((node) => {
              if (node.type === "source-column") {
                const isConnected = initialEdges.some((e) => e.source === node.id);
                return { ...node, data: { ...(node.data as SourceColumnNodeData), isConnected } } as FlowNode;
              }
              if (node.type === "target-field") {
                const edge = initialEdges.find((e) => e.target === node.id);
                const sourceNode = edge ? sourceNodes.find((n) => n.id === edge.source) : null;
                return {
                  ...node,
                  data: {
                    ...(node.data as TargetFieldNodeData),
                    isConnected: !!edge,
                    connectedColumn: sourceNode?.data.columnName ?? null,
                  },
                } as FlowNode;
              }
              return node;
            })
          );
        }

        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        setIsLoading(false);
      }
    };

    void loadPreviewData();
  }, [previewId, sheetIndex, setNodes, setEdges]);

  // Handle new connections (source→target, source→transform, transform→target)
  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (!sourceNode || !targetNode) return;

      const isSourceToTarget = sourceNode.type === "source-column" && targetNode.type === "target-field";
      const isSourceToTransform = sourceNode.type === "source-column" && targetNode.type === "transform";
      const isTransformToTarget = sourceNode.type === "transform" && targetNode.type === "target-field";

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
          upstreamNode?.type === "source-column" ? (upstreamNode.data as SourceColumnNodeData).columnName : null;

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

  // Handle edge deletion
  const onEdgesDelete = useCallback(
    (deletedEdges: FlowEdge[]) => {
      for (const edge of deletedEdges) {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === edge.source && node.type === "source-column") {
              // eslint-disable-next-line sonarjs/no-nested-functions -- Callback required by React state setter pattern
              const stillConnected = edges.some((e) => e.source === edge.source && e.id !== edge.id);
              return {
                ...node,
                data: { ...(node.data as SourceColumnNodeData), isConnected: stillConnected },
              } as FlowNode;
            }
            if (node.id === edge.target && node.type === "target-field") {
              return {
                ...node,
                data: { ...(node.data as TargetFieldNodeData), isConnected: false, connectedColumn: null },
              } as FlowNode;
            }
            return node;
          })
        );
      }
    },
    [edges, setNodes]
  );

  // Add a new transform node at the specified position
  const addTransformNode = useCallback(
    (type: TransformType, position: { x: number; y: number }) => {
      const transform = createTransform(type);
      const newNode: FlowNode = {
        id: `transform-${transform.id}`,
        type: "transform",
        position,
        data: { transform, isEditing: false } as TransformNodeData,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  // Convert flow state to FieldMapping + ImportTransforms
  // eslint-disable-next-line sonarjs/max-lines-per-function -- Serialization logic for both direct mappings and transform chains
  const serializeFlowState = useCallback((): FlowEditorResult => {
    const mapping: FieldMapping = {
      sheetIndex,
      titleField: null,
      descriptionField: null,
      locationNameField: null,
      dateField: null,
      idField: null,
      idStrategy: "auto",
      locationField: null,
      latitudeField: null,
      longitudeField: null,
    };
    const transforms: ImportTransform[] = [];
    const validKeys = TARGET_FIELD_DEFINITIONS.map((d) => d.fieldKey);

    // Process direct source→target edges
    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (sourceNode?.type === "source-column" && targetNode?.type === "target-field") {
        const sourceData = sourceNode.data as SourceColumnNodeData;
        const targetData = targetNode.data as TargetFieldNodeData;
        if (validKeys.includes(targetData.fieldKey)) {
          (mapping as unknown as Record<string, string | null>)[targetData.fieldKey] = sourceData.columnName;
        }
      }
    }

    // Process transform chains: source→transform→target
    const transformNodes = nodes.filter((n) => n.type === "transform");
    for (const tNode of transformNodes) {
      const transformData = tNode.data as TransformNodeData;
      if (!transformData.transform.active) continue;

      // Find incoming edge: source-column → transform
      const incomingEdge = edges.find((e) => e.target === tNode.id);
      const srcNode = incomingEdge
        ? nodes.find((n) => n.id === incomingEdge.source && n.type === "source-column")
        : null;

      // Find outgoing edge: transform → target-field
      const outgoingEdge = edges.find((e) => e.source === tNode.id);
      const tgtNode = outgoingEdge
        ? nodes.find((n) => n.id === outgoingEdge.target && n.type === "target-field")
        : null;

      // Only include fully connected chains
      if (!srcNode || !tgtNode) continue;

      const sourceData = srcNode.data as SourceColumnNodeData;
      const targetData = tgtNode.data as TargetFieldNodeData;

      // Clone and auto-populate the transform's from field
      const transform = { ...transformData.transform };
      if ("from" in transform && !transform.from) {
        (transform as { from: string }).from = sourceData.columnName;
      }

      // Only include valid transforms
      if (!isTransformValid(transform)) continue;

      transforms.push(transform);

      // Also populate the field mapping for this chain
      if (validKeys.includes(targetData.fieldKey)) {
        // For rename: map to the output name; for others: column name is unchanged
        const mappedColumn = transform.type === "rename" ? transform.to : sourceData.columnName;
        (mapping as unknown as Record<string, string | null>)[targetData.fieldKey] = mappedColumn;
      }
    }

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
    sheetInfo,
    serializeFlowState,
  };
};
