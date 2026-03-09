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
import { createElement } from "react";

import { parseStrictInteger } from "@/lib/utils/event-params";

import { FlowEditorWrapper } from "./_components/flow-editor-wrapper";

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
  const sheetIndex = params.sheetIndex ? (parseStrictInteger(params.sheetIndex) ?? 0) : 0;
  const scheduleId = params.scheduleId ? parseStrictInteger(params.scheduleId) : null;
  const datasetId = params.datasetId ? parseStrictInteger(params.datasetId) : null;

  return createElement(FlowEditorWrapper, { previewId, sheetIndex, scheduleId, datasetId });
}
