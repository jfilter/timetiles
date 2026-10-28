/**
 * Custom hook for flow editor state management.
 *
 * Handles loading preview data and holds the React Flow nodes and edges. The
 * graph operations live in `flow-graph.ts`, the conversion back to
 * FieldMapping in `flow-serialization.ts`.
 *
 * @module
 * @category Hooks
 */
"use client";

import { addEdge, type Connection, useEdgesState, useNodesState } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { TransformType } from "@/lib/definitions/transform-registry";
import { usePreviewSheetsQuery } from "@/lib/hooks/use-ingest-wizard-queries";
import { createTransform, type IngestTransform } from "@/lib/ingest/types/transforms";
import type { SheetInfo } from "@/lib/ingest/types/wizard";

import { useWizardStore } from "../../_components/wizard-store";
import {
  buildInitialGraph,
  connectionNodeUpdate,
  edgeDeletionNodeUpdate,
  type FlowEdge,
  type FlowNode,
  NODE_TYPE_TRANSFORM,
} from "./flow-graph";
import { type FlowEditorResult, serializeFlow } from "./flow-serialization";

/** Why the flow editor cannot render. Translated at the render site so keys stay literal. */
export type FlowEditorError =
  | { kind: "noPreviewId" }
  | { kind: "loadFailed" }
  | { kind: "sheetNotFound"; sheetIndex: number }
  | { kind: "message"; message: string };

/** Stable reference for empty transforms array to avoid re-render loops in useEffect. */
const EMPTY_TRANSFORMS: IngestTransform[] = [];

interface UseFlowEditorResult {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onNodesChange: ReturnType<typeof useNodesState<FlowNode>>[2];
  onEdgesChange: ReturnType<typeof useEdgesState<FlowEdge>>[2];
  onConnect: (params: Connection) => void;
  onEdgesDelete: (deletedEdges: FlowEdge[]) => void;
  addTransformNode: (type: TransformType, position: { x: number; y: number }) => void;
  isLoading: boolean;
  error: FlowEditorError | null;
  sheetInfo: SheetInfo | null;
  serializeFlowState: () => FlowEditorResult;
}

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
  // A discriminated CAUSE, not a sentence: these are rendered full-screen, and returning
  // English from this hook meant /de showed English. The literals escaped the
  // i18next/no-literal-string rule because they live in a .ts hook rather than in JSX.
  // The render site switches on `kind` so every t() call keeps a literal key, which is what
  // next-intl's types require. A server message is passed through — no key can express it.
  const error = ((): FlowEditorError | null => {
    if (!previewId) return { kind: "noPreviewId" };
    if (queryError) {
      return queryError instanceof Error ? { kind: "message", message: queryError.message } : { kind: "loadFailed" };
    }
    if (sheet === null && !queryLoading) return { kind: "sheetNotFound", sheetIndex };
    return null;
  })();

  // Initialize nodes/edges when preview data arrives (once per query result)
  useEffect(() => {
    if (!sheet || hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    const graph = buildInitialGraph(sheet, sheetIndex, wizardFieldMapping, wizardTransforms);
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [sheet, sheetIndex, setNodes, setEdges, wizardFieldMapping, wizardTransforms]);

  // Handle new connections (source→target, source→transform, transform→target)
  const onConnect = useCallback(
    (params: Connection) => {
      const updateNode = connectionNodeUpdate(nodes, edges, params);
      if (!updateNode) return;

      // Replace existing edges to the same target node
      setEdges((eds) =>
        addEdge(
          { ...params, id: `edge-${params.source}-${params.target}`, data: { isValid: true } },
          eds.filter((e) => e.target !== params.target)
        )
      );
      setNodes((nds) => nds.map(updateNode));
    },
    [nodes, edges, setEdges, setNodes]
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: FlowEdge[]) => {
      const updateNode = edgeDeletionNodeUpdate(edges, deletedEdges);
      setNodes((nds) => nds.map(updateNode));
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
        data: { transform, isEditing: false },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const serializeFlowState = useCallback(
    (): FlowEditorResult => serializeFlow(nodes, edges, sheetIndex, wizardFieldMapping),
    [nodes, edges, sheetIndex, wizardFieldMapping]
  );

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
