/**
 * Hook for generating ID preview column from transformed sample data.
 *
 * Delegates to the shared {@link generateIdPreview} utility so that
 * strategy dispatch and field extraction logic has a single source of truth
 * with the server-side generator in `lib/services/id-generation.ts`.
 *
 * @module
 * @category Hooks
 */
import { useMemo } from "react";

import type { FieldMapping } from "@/lib/types/ingest-wizard";
import { generateIdPreview } from "@/lib/utils/event-id";

/**
 * Generate ID preview values based on the active mapping's ID strategy.
 *
 * Returns the transformed sample data with a `__id` field prepended to each row.
 *
 * @param contentHashLabel - Translated label for content-hash strategy preview.
 */
export const useIdPreview = (
  transformedSampleData: Record<string, unknown>[],
  activeMapping: FieldMapping | undefined,
  contentHashLabel: string
): Record<string, unknown>[] => {
  return useMemo(() => {
    if (!activeMapping) return transformedSampleData;
    return transformedSampleData.map((row, i) => ({
      __id: generateIdPreview(row, activeMapping.idStrategy, activeMapping.idField, {
        contentHashPlaceholder: contentHashLabel,
        autoIndex: i + 1,
      }),
      ...row,
    }));
  }, [transformedSampleData, activeMapping, contentHashLabel]);
};
