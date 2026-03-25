/**
 * Hook for generating ID preview column from transformed sample data.
 *
 * Shows the source of each ID (not the actual hash) based on the
 * selected ID strategy. Real ID generation lives server-side in
 * lib/services/id-generation.ts.
 *
 * @module
 * @category Hooks
 */
import { useMemo } from "react";

import type { FieldMapping } from "@/lib/types/ingest-wizard";

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
    const strategy = activeMapping.idStrategy;
    return transformedSampleData.map((row, i) => {
      let id: string;
      const stringify = (v: unknown): string => (typeof v === "object" ? JSON.stringify(v) : String(v as string));
      if (strategy === "external" && activeMapping.idField) {
        const val = row[activeMapping.idField];
        id = val != null ? stringify(val) : "";
      } else if (strategy === "content-hash") {
        id = contentHashLabel;
      } else {
        // strategy === "auto-generate"
        id = `auto-${i + 1}`;
      }
      return { __id: id, ...row };
    });
  }, [transformedSampleData, activeMapping, contentHashLabel]);
};
