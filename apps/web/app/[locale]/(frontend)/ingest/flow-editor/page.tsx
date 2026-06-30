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
import { getTranslations } from "next-intl/server";
import { createElement } from "react";

import { parseStrictInteger } from "@/lib/utils/event-params";

import { FlowEditorWrapper } from "./_components/flow-editor-wrapper";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("Ingest");
  return { title: `${t("flowEditorTitle")} | TimeTiles`, description: t("flowEditorMetaDescription") };
};

interface FlowEditorPageProps {
  searchParams: Promise<{ previewId?: string; sheetIndex?: string }>;
}

export default async function FlowEditorPage({ searchParams }: Readonly<FlowEditorPageProps>) {
  const params = await searchParams;
  const previewId = params.previewId ?? null;
  const sheetIndex = params.sheetIndex ? (parseStrictInteger(params.sheetIndex) ?? 0) : 0;

  return createElement(FlowEditorWrapper, { previewId, sheetIndex });
}
