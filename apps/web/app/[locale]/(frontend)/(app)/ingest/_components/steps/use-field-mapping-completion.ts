/**
 * Hook for computing field mapping completion status.
 *
 * Calculates how many required fields are mapped and which are missing.
 *
 * @module
 * @category Hooks
 */
import { useMemo } from "react";

import type { FieldMapping } from "@/lib/ingest/types/wizard";

export interface FieldMappingCompletion {
  mapped: number;
  total: number;
  missing: string[];
}

/**
 * Compute the completion status of required field mappings for a sheet.
 *
 * Required fields: title, date, and location (either address or lat/lng pair).
 */
export const useFieldMappingCompletion = (activeMapping: FieldMapping | undefined): FieldMappingCompletion => {
  return useMemo(() => {
    if (!activeMapping) return { mapped: 0, total: 3, missing: ["fieldTitle", "fieldDate", "location"] };
    const missing: string[] = [];
    if (!activeMapping.titleField) missing.push("fieldTitle");
    if (!activeMapping.dateField) missing.push("fieldDate");
    const hasLocation = activeMapping.locationField ?? (activeMapping.latitudeField && activeMapping.longitudeField);
    if (!hasLocation) missing.push("location");
    return { mapped: 3 - missing.length, total: 3, missing };
  }, [activeMapping]);
};
