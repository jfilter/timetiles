/**
 * Schema comparison utilities for detecting changes.
 *
 * Contains functions for comparing schemas, detecting breaking changes,
 * and generating comparison reports.
 *
 * @module
 * @category Services/SchemaBuilder
 */

import type { TransformSuggestion } from "@/lib/types/import-transforms";
import type { SchemaChange, SchemaComparison } from "@/lib/types/schema-detection";

interface SchemaPropertyMap {
  [key: string]: unknown;
}

interface ChangeDetectionContext {
  oldProps: SchemaPropertyMap;
  newProps: SchemaPropertyMap;
  oldRequired: string[];
  newRequired: string[];
  changes: SchemaChange[];
}

/**
 * Detects removed fields from schema.
 */
const detectRemovedFields = (context: ChangeDetectionContext): boolean => {
  let hasBreakingChanges = false;
  const { oldProps, newProps, changes } = context;

  for (const field of Object.keys(oldProps)) {
    if (!newProps[field]) {
      const change: SchemaChange = {
        type: "removed_field",
        path: field,
        details: {
          description: `Field '${field}' was removed`,
        },
        severity: "error",
        autoApprovable: false,
      };
      changes.push(change);
      hasBreakingChanges = true;
    }
  }

  return hasBreakingChanges;
};

/**
 * Detects newly added fields in schema.
 */
const detectAddedFields = (context: ChangeDetectionContext): boolean => {
  let hasBreakingChanges = false;
  const { oldProps, newProps, newRequired, changes } = context;

  // Check if this is a first import (no existing fields)
  const isFirstImport = Object.keys(oldProps).length === 0;

  for (const field of Object.keys(newProps)) {
    if (!oldProps[field]) {
      const isRequired = newRequired.includes(field);

      // For first imports, all new fields are non-breaking
      const isBreaking = !isFirstImport && isRequired;

      const change: SchemaChange = {
        type: "new_field",
        path: field,
        details: {
          description: `Field '${field}' was added${isRequired ? " (required)" : ""}`,
          required: isRequired,
        },
        severity: isBreaking ? "error" : "info",
        autoApprovable: !isBreaking,
      };
      changes.push(change);
      if (isBreaking) {
        hasBreakingChanges = true;
      }
    }
  }

  return hasBreakingChanges;
};

/**
 * Detects enum value changes.
 */
const detectEnumChanges = (
  field: string,
  oldProp: Record<string, unknown>,
  newProp: Record<string, unknown>,
  changes: SchemaChange[]
): boolean => {
  if (!oldProp.enum || !newProp.enum) {
    return false;
  }

  const oldEnum = (oldProp.enum as unknown[]) || [];
  const newEnum = (newProp.enum as unknown[]) || [];

  const added = newEnum.filter((v) => !oldEnum.includes(v));
  const removed = oldEnum.filter((v) => !newEnum.includes(v));

  if (added.length > 0 || removed.length > 0) {
    const change: SchemaChange = {
      type: "enum_change",
      path: field,
      details: {
        description: `Enum values changed for '${field}'`,
        added,
        removed,
      },
      severity: removed.length > 0 ? "warning" : "info",
      autoApprovable: removed.length === 0,
    };
    changes.push(change);
    return removed.length > 0;
  }

  return false;
};

/**
 * Detects type and enum changes in existing fields.
 */
const detectFieldModifications = (context: ChangeDetectionContext): boolean => {
  let hasBreakingChanges = false;
  const { oldProps, newProps, changes } = context;

  for (const field of Object.keys(oldProps)) {
    if (!newProps[field]) continue;

    const oldProp = oldProps[field] as Record<string, unknown>;
    const newProp = newProps[field] as Record<string, unknown>;

    const oldType = getFieldType(oldProp);
    const newType = getFieldType(newProp);

    if (oldType !== newType) {
      const change: SchemaChange = {
        type: "type_change",
        path: field,
        details: {
          description: `Field '${field}' type changed from ${oldType} to ${newType}`,
          oldType,
          newType,
        },
        severity: "error",
        autoApprovable: false,
      };
      changes.push(change);
      hasBreakingChanges = true;
    } else if (detectEnumChanges(field, oldProp, newProp, changes)) {
      hasBreakingChanges = true;
    }
  }

  return hasBreakingChanges;
};

/**
 * Detects changes in required field status.
 */
const detectRequiredFieldChanges = (context: ChangeDetectionContext): boolean => {
  let hasBreakingChanges = false;
  const { oldProps, newProps, oldRequired, newRequired, changes } = context;

  const addedRequired = newRequired.filter((f) => !oldRequired.includes(f));
  const removedRequired = oldRequired.filter((f) => !newRequired.includes(f));

  for (const field of addedRequired) {
    if (oldProps[field]) {
      // Field existed but became required (breaking)
      const change: SchemaChange = {
        type: "format_change",
        path: field,
        details: {
          description: `Field '${field}' became required`,
        },
        severity: "error",
        autoApprovable: false,
      };
      changes.push(change);
      hasBreakingChanges = true;
    }
  }

  for (const field of removedRequired) {
    if (newProps[field]) {
      // Field became optional (non-breaking)
      const change: SchemaChange = {
        type: "format_change",
        path: field,
        details: {
          description: `Field '${field}' became optional`,
        },
        severity: "info",
        autoApprovable: true,
      };
      changes.push(change);
    }
  }

  return hasBreakingChanges;
};

/**
 * Compares two schemas and identifies changes.
 */
export const compareSchemas = (
  oldSchema: Record<string, unknown>,
  newSchema: Record<string, unknown>
): SchemaComparison => {
  const changes: SchemaChange[] = [];

  const context: ChangeDetectionContext = {
    oldProps: (oldSchema.properties as SchemaPropertyMap) ?? {},
    newProps: (newSchema.properties as SchemaPropertyMap) ?? {},
    oldRequired: (oldSchema.required as string[]) ?? [],
    newRequired: (newSchema.required as string[]) ?? [],
    changes,
  };

  // Debug check for test environment
  if (process.env.NODE_ENV === "test" && Object.keys(context.oldProps).length === 0 && oldSchema.properties) {
    // oldProps is empty but oldSchema.properties exists - this shouldn't happen
  }

  // Run all detection phases
  const removedBreaking = detectRemovedFields(context);
  const addedBreaking = detectAddedFields(context);
  const modificationBreaking = detectFieldModifications(context);
  const requiredBreaking = detectRequiredFieldChanges(context);

  const isBreaking = removedBreaking || addedBreaking || modificationBreaking || requiredBreaking;

  // Determine if changes require approval
  const requiresApproval = changes.some((c) => c.severity === "error" || c.severity === "warning");
  const canAutoApprove = changes.every((c) => c.autoApprovable);

  return {
    changes,
    isBreaking,
    requiresApproval,
    canAutoApprove,
  };
};

/**
 * Gets the type of a field from schema property.
 */
const getFieldType = (prop: unknown): string => {
  if (!prop || typeof prop !== "object") return "unknown";

  const property = prop as Record<string, unknown>;

  if (property.type) {
    if (Array.isArray(property.type)) {
      return property.type.filter((t) => t !== "null").join(" | ");
    }
    // Handle object types (shouldn't happen in valid JSON Schema, but be defensive)
    if (typeof property.type === "object") {
      return JSON.stringify(property.type);
    }
    // Type is guaranteed to be a primitive here
    return property.type as string;
  }

  if (property.oneOf ?? property.anyOf) {
    return "union";
  }

  if (property.enum) {
    return "enum";
  }

  return "unknown";
};

/**
 * Generates a human-readable summary of schema changes.
 */
export const generateChangeSummary = (comparison: SchemaComparison): string => {
  const lines: string[] = [];

  if (comparison.changes.length === 0) {
    return "No schema changes detected";
  }

  lines.push(
    `Schema Changes Summary:`,
    `- Total changes: ${comparison.changes.length}`,
    `- Breaking changes: ${comparison.isBreaking ? "Yes" : "No"}`,
    `- Requires approval: ${comparison.requiresApproval ? "Yes" : "No"}`,
    `- Can auto-approve: ${comparison.canAutoApprove ? "Yes" : "No"}`
  );

  const breakingChanges = comparison.changes.filter((c) => c.severity === "error");
  if (breakingChanges.length > 0) {
    lines.push("", "Breaking Changes:");
    for (const change of breakingChanges) {
      const details = change.details as { description?: string };
      const fallback = change.type + " at " + change.path;
      lines.push(`  - ${details.description ?? fallback}`);
    }
  }

  const nonBreaking = comparison.changes.filter((c) => c.severity !== "error");
  if (nonBreaking.length > 0) {
    lines.push("", "Non-Breaking Changes:");
    for (const change of nonBreaking) {
      const details = change.details as { description?: string };
      const fallback = change.type + " at " + change.path;
      lines.push(`  - ${details.description ?? fallback}`);
    }
  }

  return lines.join("\n");
};

/**
 * Transform detection utilities
 */

/**
 * Detect potential transform rules from schema changes.
 *
 * Analyzes removed and added fields to identify likely renames.
 * Returns suggestions with confidence scores based on multiple factors.
 *
 * @param oldSchema - The existing/previous schema
 * @param newSchema - The new/detected schema
 * @param changes - The detected schema changes
 * @returns Array of transform suggestions
 */
export const detectTransforms = (
  oldSchema: Record<string, unknown>,
  newSchema: Record<string, unknown>,
  changes: SchemaChange[]
): TransformSuggestion[] => {
  const suggestions: TransformSuggestion[] = [];

  // Find removed and added fields
  const removed = changes.filter((c) => c.type === "removed_field");
  const added = changes.filter((c) => c.type === "new_field");

  // Try to match removed → added as renames
  for (const removedChange of removed) {
    for (const addedChange of added) {
      const suggestion = detectRenameTransform(removedChange.path, addedChange.path, oldSchema, newSchema);

      if (suggestion && suggestion.confidence >= 70) {
        suggestions.push(suggestion);
      }
    }
  }

  return suggestions;
};

/**
 * Detect if two field changes represent a rename.
 *
 * Analyzes multiple factors to determine if a removed + added field
 * pair represents an intentional field rename.
 *
 * Scoring breakdown:
 * - Name similarity: 0-40 points (Levenshtein distance)
 * - Type compatibility: 0-30 points (same or compatible types)
 * - Common patterns: 0-20 points (matches known rename patterns)
 * - Position proximity: 0-10 points (similar position in schema)
 *
 * Threshold: >= 70 points to suggest a rename
 *
 * @param oldPath - Path of the removed field (existing schema)
 * @param newPath - Path of the added field (new schema)
 * @param oldSchema - The existing/previous schema
 * @param newSchema - The new/detected schema
 * @returns Transform suggestion if confidence >= 70, otherwise null
 */
const detectRenameTransform = (
  oldPath: string,
  newPath: string,
  oldSchema: Record<string, unknown>,
  newSchema: Record<string, unknown>
): TransformSuggestion | null => {
  let score = 0;
  const reasons: string[] = [];

  // 1. Name similarity (40 points max)
  const similarity = calculateSimilarity(oldPath, newPath);
  const similarityScore = similarity * 40;
  score += similarityScore;
  if (similarity > 0.5) {
    reasons.push(`Similar names (${Math.round(similarity * 100)}%)`);
  }

  // 2. Type compatibility (30 points max)
  const oldProp = (oldSchema.properties as SchemaPropertyMap)?.[oldPath];
  const newProp = (newSchema.properties as SchemaPropertyMap)?.[newPath];

  if (oldProp && newProp) {
    const oldType = getFieldType(oldProp);
    const newType = getFieldType(newProp);

    if (typesCompatible(oldType, newType)) {
      score += 30;
      reasons.push("Compatible types");
    }
  }

  // 3. Common rename patterns (20 points max)
  if (matchesCommonPattern(oldPath, newPath)) {
    score += 20;
    reasons.push("Matches common rename pattern");
  }

  // 4. Position proximity (10 points max)
  const positionScore = calculatePositionScore(oldPath, newPath, oldSchema, newSchema);
  score += positionScore;
  if (positionScore > 5) {
    reasons.push("Similar position in schema");
  }

  // Confidence threshold: 70+ = suggest rename
  if (score >= 70) {
    return {
      type: "rename",
      from: newPath, // What's in the new import file
      to: oldPath, // What's in the existing schema
      confidence: Math.round(score),
      reason: reasons.join(", "),
    };
  }

  return null;
};

/**
 * Calculate string similarity using Levenshtein distance.
 *
 * Extracts leaf names for nested paths and compares them
 * case-insensitively.
 *
 * @param str1 - First field path
 * @param str2 - Second field path
 * @returns Similarity score (0-1, where 1 is identical)
 */
const calculateSimilarity = (str1: string, str2: string): number => {
  // Extract leaf names for nested paths
  const leaf1 = str1.split(".").pop() ?? str1;
  const leaf2 = str2.split(".").pop() ?? str2;

  const longer = leaf1.length > leaf2.length ? leaf1 : leaf2;
  const shorter = leaf1.length > leaf2.length ? leaf2 : leaf1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - distance) / longer.length;
};

/**
 * Calculate Levenshtein distance between two strings.
 *
 * The Levenshtein distance is the minimum number of single-character
 * edits (insertions, deletions, or substitutions) required to change
 * one string into the other.
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Levenshtein distance (0 = identical)
 */
const levenshteinDistance = (str1: string, str2: string): number => {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create 2D array for dynamic programming
  const matrix: number[][] = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      const row = matrix[i]!;
      const prevRow = matrix[i - 1]!;
      row[j] = Math.min(
        prevRow[j]! + 1, // Deletion
        row[j - 1]! + 1, // Insertion
        prevRow[j - 1]! + cost // Substitution
      );
    }
  }

  return matrix[len1]![len2]!;
};

/**
 * Check if two types are compatible.
 *
 * Types are compatible if they're the same or one is a subset of the other.
 * For example, "string" is compatible with "string | null".
 *
 * @param oldType - Original field type
 * @param newType - New field type
 * @returns True if types are compatible
 */
const typesCompatible = (oldType: string, newType: string): boolean => {
  // Exact match
  if (oldType === newType) return true;

  // Handle nullable types (e.g., "string | null")
  const oldBase = oldType.replace(" | null", "").trim();
  const newBase = newType.replace(" | null", "").trim();

  if (oldBase === newBase) return true;

  // Date and string are somewhat compatible
  return (oldType === "string" && newType === "date") || (oldType === "date" && newType === "string");
};

/**
 * Check if rename matches common patterns.
 *
 * Detects common field renaming patterns like:
 * - Adding prefixes: "date" → "start_date", "date" → "end_date"
 * - Adding suffixes: "author" → "author_name"
 * - Removing suffixes: "user_id" → "user"
 * - Adding context: "title" → "event_title"
 *
 * @param oldPath - Path of the removed field
 * @param newPath - Path of the added field
 * @returns True if matches a common pattern
 */
const matchesCommonPattern = (oldPath: string, newPath: string): boolean => {
  // Extract leaf names
  const oldLeaf = (oldPath.split(".").pop() ?? oldPath).toLowerCase();
  const newLeaf = (newPath.split(".").pop() ?? newPath).toLowerCase();

  // Check common patterns by constructing expected strings
  const patterns: Array<(old: string) => string | null> = [
    (old) => `start_${old}`, // "date" → "start_date"
    (old) => `end_${old}`, // "date" → "end_date"
    (old) => `${old}_name`, // "author" → "author_name"
    (old) => `event_${old}`, // "title" → "event_title"
    (old) => `item_${old}`, // "title" → "item_title"
    (old) => `${old}_id`, // "user" → "user_id"
  ];

  // Check if newLeaf matches any pattern applied to oldLeaf
  for (const pattern of patterns) {
    const expected = pattern(oldLeaf);
    if (expected === newLeaf) {
      return true;
    }
  }

  // Check reverse patterns (e.g., "user_id" → "user")
  const reversePatterns: Array<(newVal: string) => string | null> = [
    (newVal) => (newVal.startsWith("start_") ? newVal.substring(6) : null),
    (newVal) => (newVal.startsWith("end_") ? newVal.substring(4) : null),
    (newVal) => (newVal.endsWith("_name") ? newVal.slice(0, -5) : null),
    (newVal) => (newVal.startsWith("event_") ? newVal.substring(6) : null),
    (newVal) => (newVal.startsWith("item_") ? newVal.substring(5) : null),
    (newVal) => (newVal.endsWith("_id") ? newVal.slice(0, -3) : null),
  ];

  // Check if oldLeaf matches any reverse pattern applied to newLeaf
  for (const pattern of reversePatterns) {
    const expected = pattern(newLeaf);
    if (expected === oldLeaf) {
      return true;
    }
  }

  return false;
};

/**
 * Calculate position proximity score.
 *
 * Fields that appear in similar positions in the schema are more
 * likely to be renames (e.g., both are the 2nd field).
 *
 * @param oldPath - Path of the removed field
 * @param newPath - Path of the added field
 * @param oldSchema - The existing/previous schema
 * @param newSchema - The new/detected schema
 * @returns Position score (0-10 points)
 */
const calculatePositionScore = (
  oldPath: string,
  newPath: string,
  oldSchema: Record<string, unknown>,
  newSchema: Record<string, unknown>
): number => {
  const oldProps = (oldSchema.properties as SchemaPropertyMap) ?? {};
  const newProps = (newSchema.properties as SchemaPropertyMap) ?? {};

  const oldKeys = Object.keys(oldProps);
  const newKeys = Object.keys(newProps);

  const oldIndex = oldKeys.indexOf(oldPath);
  const newIndex = newKeys.indexOf(newPath);

  if (oldIndex === -1 || newIndex === -1) return 0;

  // Calculate difference in position
  const diff = Math.abs(oldIndex - newIndex);

  // Score decreases with distance
  if (diff === 0) return 10; // Same position
  if (diff === 1) return 7; // Adjacent
  if (diff === 2) return 4; // Close
  return 0; // Too far apart
};
