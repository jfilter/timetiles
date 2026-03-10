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

import type { FieldMapping, SheetInfo } from "@/app/(frontend)/import/_components/wizard-context";
import type { SourceColumnNodeData, TargetFieldNodeData, TransformNodeData } from "@/lib/types/flow-mapping";
import { createSourceNodes, createTargetNodes, TARGET_FIELD_DEFINITIONS } from "@/lib/types/flow-mapping";
import { createTransform, type TransformType } from "@/lib/types/import-transforms";

type FlowNode = Node<SourceColumnNodeData | TargetFieldNodeData | TransformNodeData>;
type FlowEdge = Edge<{ isValid: boolean; confidence?: number }>;

interface MappingPair {
  source: string | null;
  target: string;
  confidence: number;
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
  flowToFieldMapping: () => FieldMapping;
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
        const response = await fetch(`/api/wizard/preview-schema?previewId=${previewId}`);
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

  // Handle new connections
  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (sourceNode?.type !== "source-column" || targetNode?.type !== "target-field") return;

      setEdges((eds) => eds.filter((e) => e.target !== params.target));
      setEdges((eds) =>
        addEdge({ ...params, id: `edge-${params.source}-${params.target}`, data: { isValid: true } }, eds)
      );

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
    },
    [nodes, setEdges, setNodes]
  );

  // Handle edge deletion
  const onEdgesDelete = useCallback(
    (deletedEdges: FlowEdge[]) => {
      for (const edge of deletedEdges) {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === edge.source) {
              // eslint-disable-next-line sonarjs/no-nested-functions -- Callback required by React state setter pattern
              const stillConnected = edges.some((e) => e.source === edge.source && e.id !== edge.id);
              return {
                ...node,
                data: { ...(node.data as SourceColumnNodeData), isConnected: stillConnected },
              } as FlowNode;
            }
            if (node.id === edge.target) {
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
        data: {
          transform,
          isEditing: false,
        } as TransformNodeData,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  // Convert flow state to FieldMapping
  const flowToFieldMapping = useCallback((): FieldMapping => {
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

    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);

      if (sourceNode?.type === "source-column" && targetNode?.type === "target-field") {
        const sourceData = sourceNode.data as SourceColumnNodeData;
        const targetData = targetNode.data as TargetFieldNodeData;
        const fieldKey = targetData.fieldKey;

        const validKeys = TARGET_FIELD_DEFINITIONS.map((d) => d.fieldKey);
        if (validKeys.includes(fieldKey)) {
          (mapping as unknown as Record<string, string | null>)[fieldKey] = sourceData.columnName;
        }
      }
    }

    return mapping;
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
    flowToFieldMapping,
  };
};
