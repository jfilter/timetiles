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

import type { Edge, Node } from "@xyflow/react";

import type { FieldMapping } from "@/app/(frontend)/import/_components/wizard-context";

import type { ImportTransform } from "./import-transforms";

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
 * Uses the shared ImportTransform for configuration
 */
export interface TransformNodeData extends Record<string, unknown> {
  /** The transform configuration */
  transform: ImportTransform;
  /** Whether this node is currently selected for editing */
  isEditing: boolean;
}

/**
 * Custom node types for the flow editor
 */
export type FlowMappingNodeType = "source-column" | "target-field" | "transform";

/**
 * Union of all flow mapping node data types
 */
export type FlowMappingNodeData = SourceColumnNodeData | TargetFieldNodeData | TransformNodeData;

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
 * Union of all flow mapping nodes
 */
export type FlowMappingNode = SourceColumnNode | TargetFieldNode | TransformNode;

/**
 * Data attached to edges for validation status
 */
export interface FlowMappingEdgeData extends Record<string, unknown> {
  /** Whether this edge represents a valid mapping */
  isValid: boolean;
  /** Validation error message if invalid */
  validationError?: string;
  /** Sample value being passed through */
  sampleValue?: unknown;
  /** Confidence level if auto-detected (0-1) */
  confidence?: number;
}

/**
 * Typed edge for flow mappings
 */
export type FlowMappingEdge = Edge<FlowMappingEdgeData>;

/**
 * Complete flow mapping configuration for persistence
 */
export interface FlowMappingConfig {
  /** Schema version for migrations */
  version: "1.0";
  /** Serialized nodes */
  nodes: SerializedNode[];
  /** Serialized edges */
  edges: SerializedEdge[];
  /** List of transform configurations */
  transforms: ImportTransform[];
  /** Viewport state for restoring view */
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

/**
 * Serialized node for database storage
 */
export interface SerializedNode {
  id: string;
  type: FlowMappingNodeType;
  position: { x: number; y: number };
  data: FlowMappingNodeData;
}

/**
 * Serialized edge for database storage
 */
export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Target field definitions with metadata
 */
export const TARGET_FIELD_DEFINITIONS: Array<{
  fieldKey: TargetFieldNodeData["fieldKey"];
  label: string;
  icon: string;
  required: boolean;
  description: string;
}> = [
  {
    fieldKey: "titleField",
    label: "Title",
    icon: "Text",
    required: true,
    description: "The main title or name of the event",
  },
  {
    fieldKey: "dateField",
    label: "Date",
    icon: "Calendar",
    required: true,
    description: "When the event occurs",
  },
  {
    fieldKey: "locationField",
    label: "Location",
    icon: "MapPin",
    required: false,
    description: "Address or location description for geocoding",
  },
  {
    fieldKey: "latitudeField",
    label: "Latitude",
    icon: "MapPin",
    required: false,
    description: "Geographic latitude coordinate",
  },
  {
    fieldKey: "longitudeField",
    label: "Longitude",
    icon: "MapPin",
    required: false,
    description: "Geographic longitude coordinate",
  },
  {
    fieldKey: "descriptionField",
    label: "Description",
    icon: "FileText",
    required: false,
    description: "Detailed description of the event",
  },
  {
    fieldKey: "locationNameField",
    label: "Location Name",
    icon: "Building",
    required: false,
    description: "Name of the venue or place",
  },
  {
    fieldKey: "idField",
    label: "ID Field",
    icon: "Hash",
    required: false,
    description: "External identifier for deduplication",
  },
];

/**
 * Helper to convert flow state to FieldMapping
 */
export const flowToFieldMapping = (
  nodes: FlowMappingNode[],
  edges: FlowMappingEdge[],
  sheetIndex: number
): FieldMapping => {
  const mapping: FieldMapping = {
    sheetIndex,
    titleField: null,
    descriptionField: null,
    locationNameField: null,
    dateField: null,
    idField: null,
    idStrategy: "auto",
    locationField: null,
    latitudeField: null,
    longitudeField: null,
  };

  // Find direct connections from source to target (or through transforms)
  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    if (sourceNode?.type === "source-column" && targetNode?.type === "target-field") {
      const sourceData = sourceNode.data;
      const targetData = targetNode.data;
      const fieldKey = targetData.fieldKey as keyof FieldMapping;

      if (fieldKey in mapping && fieldKey !== "sheetIndex" && fieldKey !== "idStrategy") {
        // Dynamic property assignment requires intermediate cast
        (mapping as unknown as Record<string, string | null>)[fieldKey] = sourceData.columnName;
      }
    }
  }

  return mapping;
};

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
    position: { x: 50, y: 50 + index * 100 },
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
    position: { x: 500, y: startY + index * 80 },
    data: {
      ...def,
      isConnected: false,
      connectedColumn: null,
    },
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
