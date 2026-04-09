/**
 * Flow-specific types for the visual field mapping editor.
 *
 * These types define the node and edge structures used by the xyflow-based
 * visual editor. They reference the shared TransformConfig types for transform
 * nodes to ensure consistency with the traditional form-based UI.
 *
 * @module
 * @category Types
 */

import type { Node } from "@xyflow/react";

import { getTargetFieldDefinitions } from "@/lib/definitions/field-registry";

import type { IngestTransform } from "./ingest-transforms";
import type { FieldMapping } from "./ingest-wizard";

/**
 * Data for a source column node (left side of flow)
 * Represents a column from the uploaded file
 */
export interface SourceColumnNodeData extends Record<string, unknown> {
  /** Column name from the file header */
  columnName: string;
  /** Sheet index for multi-sheet files */
  sheetIndex: number;
  /** Sheet name for display */
  sheetName: string;
  /** Sample values from the first few rows */
  sampleValues: unknown[];
  /** Inferred data type based on content */
  inferredType: "string" | "number" | "date" | "boolean" | "mixed";
  /** Confidence level from auto-detection (0-1) */
  confidence: number;
  /** Whether this column is currently connected */
  isConnected: boolean;
}

/**
 * Data for a target field node (right side of flow)
 * Represents a destination field in the event schema
 */
export interface TargetFieldNodeData extends Record<string, unknown> {
  /** Key matching FieldMapping interface */
  fieldKey: keyof Omit<FieldMapping, "sheetIndex" | "idStrategy">;
  /** Display label for the field */
  label: string;
  /** Icon name (from lucide-react) */
  icon: string;
  /** Whether this field is required for import */
  required: boolean;
  /** Description of what this field is used for */
  description: string;
  /** Whether this field is currently connected */
  isConnected: boolean;
  /** The source column name if connected */
  connectedColumn: string | null;
}

/**
 * Data for a transform node (middle of flow)
 * Uses the shared IngestTransform for configuration
 */
export interface TransformNodeData extends Record<string, unknown> {
  /** The transform configuration */
  transform: IngestTransform;
  /** Whether this node is currently selected for editing */
  isEditing: boolean;
}

/**
 * Typed node for source columns
 */
export type SourceColumnNode = Node<SourceColumnNodeData, "source-column">;

/**
 * Typed node for target fields
 */
export type TargetFieldNode = Node<TargetFieldNodeData, "target-field">;

/**
 * Typed node for transforms
 */
export type TransformNode = Node<TransformNodeData, "transform">;

/**
 * Target field definitions with metadata.
 *
 * Derived from the canonical field registry in `@/lib/definitions/field-registry`.
 */
export const TARGET_FIELD_DEFINITIONS: Array<{
  fieldKey: TargetFieldNodeData["fieldKey"];
  label: string;
  icon: string;
  required: boolean;
  description: string;
}> = getTargetFieldDefinitions() as Array<{
  fieldKey: TargetFieldNodeData["fieldKey"];
  label: string;
  icon: string;
  required: boolean;
  description: string;
}>;

/**
 * Helper to create initial nodes from sheet data
 */
export const createSourceNodes = (
  headers: string[],
  sampleData: Record<string, unknown>[],
  sheetIndex: number,
  sheetName: string
): SourceColumnNode[] => {
  return headers.map((header, index) => ({
    id: `source-${sheetIndex}-${header}`,
    type: "source-column" as const,
    position: { x: 50, y: 50 + index * 120 },
    data: {
      columnName: header,
      sheetIndex,
      sheetName,
      sampleValues: sampleData.slice(0, 3).map((row) => row[header]),
      inferredType: inferDataType(sampleData.map((row) => row[header])),
      confidence: 1,
      isConnected: false,
    },
  }));
};

/**
 * Helper to create target field nodes
 */
export const createTargetNodes = (startY: number = 50): TargetFieldNode[] => {
  return TARGET_FIELD_DEFINITIONS.map((def, index) => ({
    id: `target-${def.fieldKey}`,
    type: "target-field" as const,
    position: { x: 500, y: startY + index * 120 },
    data: { ...def, isConnected: false, connectedColumn: null },
  }));
};

/**
 * Infer data type from sample values
 */
const inferDataType = (values: unknown[]): SourceColumnNodeData["inferredType"] => {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonNull.length === 0) return "string";

  const types = new Set(
    nonNull.map((v) => {
      if (typeof v === "number") return "number";
      if (typeof v === "boolean") return "boolean";
      if (v instanceof Date) return "date";
      if (typeof v === "string") {
        // Check if it looks like a date
        if (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(v)) {
          return "date";
        }
        // Check if it's a number string
        // eslint-disable-next-line security/detect-unsafe-regex -- Safe: used only on short sample values for type inference
        if (/^-?\d+(?:\.\d*)?$/.test(v)) {
          return "number";
        }
      }
      return "string";
    })
  );

  if (types.size === 1) return types.values().next().value as SourceColumnNodeData["inferredType"];
  return "mixed";
};
