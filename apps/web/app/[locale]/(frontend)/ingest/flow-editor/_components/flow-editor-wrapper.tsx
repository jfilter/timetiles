/**
 * Client-side wrapper for the flow editor with dynamic import.
 *
 * This wrapper handles the dynamic import of the heavy xyflow/react library
 * with SSR disabled, which must be done in a client component.
 *
 * @module
 * @category Components
 */
"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

// Hooks can't run in the `loading` thunk directly, so the fallback is its own
// component — this keeps the loading copy translated instead of hardcoded English.
const FlowEditorLoading = () => {
  const t = useTranslations("Ingest");
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-muted-foreground">{t("loadingFlowEditor")}</div>
    </div>
  );
};

// Dynamic import for heavy @xyflow/react library (~300KB)
// This reduces initial bundle size for pages that don't use the flow editor
// oxlint-disable-next-line promise/prefer-await-to-then -- next/dynamic requires .then() to select named exports
const FlowEditorClient = dynamic(() => import("./flow-editor-client").then((mod) => mod.FlowEditorClient), {
  ssr: false,
  loading: () => <FlowEditorLoading />,
});

export interface FlowEditorWrapperProps {
  previewId: string | null;
  sheetIndex: number;
}

export const FlowEditorWrapper = ({ previewId, sheetIndex }: Readonly<FlowEditorWrapperProps>) => (
  <FlowEditorClient previewId={previewId} sheetIndex={sheetIndex} />
);
