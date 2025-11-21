/**
 * Types for import transform rules that handle field mapping during data import.
 *
 * Import transforms enable schema evolution by allowing datasets to map
 * incoming field names to their canonical schema field names, supporting
 * scenarios like column renames, case variations, and JSON path changes.
 *
 * @module
 * @category Types
 */

/**
 * Types of transformations that can be applied to import data.
 *
 * Currently supports:
 * - rename: Map source field path to target field path
 *
 * Future extensions could include:
 * - split: Split one field into multiple fields
 * - merge: Combine multiple fields into one
 * - transform: Apply custom transformation function
 * - compute: Calculate field from other fields
 */
export type TransformType = "rename";

/**
 * A transform rule that maps incoming data fields to schema fields.
 *
 * Applied before schema validation and event creation to normalize
 * incoming data structure to match the dataset's canonical schema.
 */
export interface ImportTransform {
  /** Unique identifier for this transform rule */
  id: string;

  /** Type of transformation to apply */
  type: TransformType;

  /**
   * Source field path in the incoming data.
   *
   * Examples:
   * - "date" (flat CSV column)
   * - "user.email" (nested JSON path)
   * - "coordinates.0" (array element)
   */
  from: string;

  /**
   * Target field path in the dataset schema.
   *
   * Examples:
   * - "start_date"
   * - "contact.email"
   * - "latitude"
   */
  to: string;

  /**
   * Whether this transform is currently active.
   *
   * Inactive transforms are retained for history but not applied.
   */
  active: boolean;

  /** Timestamp when this transform was created */
  addedAt?: Date;

  /** User ID who created this transform */
  addedBy?: string;

  /**
   * Confidence score if auto-detected (0-100).
   *
   * Higher scores indicate stronger evidence that this transform
   * represents an intentional field rename rather than coincidence.
   */
  confidence?: number;

  /**
   * Whether this transform was suggested by auto-detection.
   *
   * Auto-detected transforms have confidence scores and explanations,
   * while manually created transforms do not.
   */
  autoDetected: boolean;
}

/**
 * A suggested transform detected by comparing schema versions.
 *
 * When schema changes are detected (e.g., field removed + field added),
 * the system analyzes whether this represents a rename and suggests
 * a transform rule if confidence is high enough.
 */
export interface TransformSuggestion {
  /** Type of transformation being suggested */
  type: TransformType;

  /**
   * Source field path (what's in the new import file).
   *
   * This is the field name that appears in the incoming data
   * that doesn't match the existing schema.
   */
  from: string;

  /**
   * Target field path (what's in the existing schema).
   *
   * This is the canonical field name in the dataset schema
   * that the incoming field should be mapped to.
   */
  to: string;

  /**
   * Confidence score (0-100) based on multiple factors:
   * - Name similarity (Levenshtein distance)
   * - Type compatibility
   * - Common rename patterns
   * - Position proximity in schema
   *
   * Threshold: >= 70 for suggestion, >= 80 for high confidence
   */
  confidence: number;

  /**
   * Human-readable explanation of why this transform was suggested.
   *
   * Examples:
   * - "Similar names (87%), Compatible types, Matches common rename pattern"
   * - "Similar names (95%), Compatible types"
   */
  reason: string;
}
