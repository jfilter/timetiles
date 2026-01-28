/**
 * Client-side wrapper for the flow editor with dynamic import.
 *
 * This wrapper handles the dynamic import of the heavy @xyflow/react library
 * with SSR disabled, which must be done in a client component.
 *
 * @module
 * @category Components
 */
"use client";

import dynamic from "next/dynamic";

// Dynamic import for heavy @xyflow/react library (~300KB)
// This reduces initial bundle size for pages that don't use the flow editor
const FlowEditorClient = dynamic(() => import("./flow-editor-client").then((mod) => mod.FlowEditorClient), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-muted-foreground">Loading flow editor...</div>
    </div>
  ),
});

interface FlowEditorWrapperProps {
  previewId: string | null;
  sheetIndex: number;
  scheduleId: number | null;
  datasetId: number | null;
}

export const FlowEditorWrapper = ({
  previewId,
  sheetIndex,
  scheduleId,
  datasetId,
}: Readonly<FlowEditorWrapperProps>) => (
  <FlowEditorClient previewId={previewId} sheetIndex={sheetIndex} scheduleId={scheduleId} datasetId={datasetId} />
);
