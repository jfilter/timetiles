/**
 * Visual flow editor page for field mapping.
 *
 * This page provides a visual drag-and-connect interface for mapping
 * source columns to target fields, with optional transformation nodes.
 *
 * @module
 * @category Pages
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";

// Dynamic import for heavy @xyflow/react library (~300KB)
// This reduces initial bundle size for pages that don't use the flow editor
const FlowEditorClient = dynamic(() => import("./_components/flow-editor-client").then((mod) => mod.FlowEditorClient), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-muted-foreground">Loading flow editor...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "Visual Field Mapping | TimeTiles",
  description: "Visually map fields from your import file to event properties",
};

interface FlowEditorPageProps {
  searchParams: Promise<{
    previewId?: string;
    sheetIndex?: string;
    scheduleId?: string;
    datasetId?: string;
  }>;
}

export default async function FlowEditorPage({ searchParams }: Readonly<FlowEditorPageProps>) {
  const params = await searchParams;
  const previewId = params.previewId ?? null;
  const sheetIndex = params.sheetIndex ? parseInt(params.sheetIndex, 10) : 0;
  const scheduleId = params.scheduleId ? parseInt(params.scheduleId, 10) : null;
  const datasetId = params.datasetId ? parseInt(params.datasetId, 10) : null;

  return (
    <FlowEditorClient previewId={previewId} sheetIndex={sheetIndex} scheduleId={scheduleId} datasetId={datasetId} />
  );
}
