/**
 * Main client component for the visual flow editor.
 *
 * Wraps ReactFlow and manages the flow state for field mapping.
 *
 * @module
 * @category Components
 */
"use client";

import "@xyflow/react/dist/style.css";

import { Button } from "@timetiles/ui/components/button";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, useCallback, useMemo, useRef } from "react";

import type { TransformType } from "@/lib/types/import-transforms";

import { FlowEditorHeader } from "./flow-editor-header";
import { NodePalette } from "./node-palette";
import { SourceColumnNode } from "./nodes/source-column-node";
import { TargetFieldNode } from "./nodes/target-field-node";
import { TransformNode } from "./nodes/transform-node";
import { useFlowEditor } from "./use-flow-editor";

interface FlowEditorClientProps {
  previewId: string | null;
  sheetIndex: number;
  scheduleId: number | null;
  datasetId: number | null;
}

// Define custom node types
const nodeTypes = {
  "source-column": SourceColumnNode,
  "target-field": TargetFieldNode,
  transform: TransformNode,
};

// Minimap color function
const getNodeColor = (node: Node): string => {
  if (node.type === "source-column") return "oklch(0.85 0.02 85)"; // cream
  if (node.type === "target-field") return "oklch(0.95 0.01 100)"; // white
  return "oklch(0.58 0.11 220)"; // blue
};

// ReactFlow options
const fitViewOptions = { padding: 0.2 };
const proOptions = { hideAttribution: true };

export const FlowEditorClient = ({ previewId, sheetIndex }: Readonly<FlowEditorClientProps>) => {
  const router = useRouter();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const {
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
  } = useFlowEditor(previewId, sheetIndex);

  // Save and return to wizard
  const handleSave = useCallback(() => {
    const mapping = flowToFieldMapping();
    const encoded = encodeURIComponent(JSON.stringify(mapping));
    router.push(`/import?step=4&applyMappings=${encoded}`);
  }, [flowToFieldMapping, router]);

  // Handle drag over to allow drop
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle dropping a transform node
  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData("application/reactflow");
      if (nodeType !== "transform") return;

      const transformType = event.dataTransfer.getData("application/transform-type") as TransformType;
      if (!transformType) return;

      // Calculate drop position relative to the flow
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };

      addTransformNode(transformType, position);
    },
    [addTransformNode]
  );

  // Memoize node types to prevent re-renders
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading preview data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-destructive">{error}</div>
        <Button variant="outline" asChild>
          <Link href="/import">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return to Import Wizard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FlowEditorHeader sheetInfo={sheetInfo} onSave={handleSave} />
      <div className="flex flex-1 overflow-hidden">
        <div ref={reactFlowWrapper} className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={memoizedNodeTypes}
            fitView
            fitViewOptions={fitViewOptions}
            proOptions={proOptions}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap nodeColor={getNodeColor} />
          </ReactFlow>
        </div>
        <NodePalette className="w-64 shrink-0" />
      </div>
    </ReactFlowProvider>
  );
};
