/**
 * Schema evaluation logic for the validate-schema job.
 *
 * Contains schema mode evaluation, approval determination, and
 * schema change extraction. All functions are pure (no side effects).
 *
 * @module
 * @category Jobs
 */
import type { SchemaComparison } from "@/lib/types/schema-detection";

export type SchemaMode = "strict" | "additive" | "flexible";

export interface ProcessingOptions {
  skipDuplicateChecking?: boolean;
  autoApproveSchema?: boolean;
  schemaMode?: SchemaMode;
}

// Schema mode result: determines if import should fail, require approval, or auto-approve
export interface SchemaModeResult {
  shouldFail: boolean;
  requiresApproval: boolean;
  failureReason?: string;
  approvalReason?: string;
}

/**
 * Determine the schema validation outcome based on schema mode
 * - strict: Any schema change = FAIL the import
 * - additive: Breaking changes = FAIL, Non-breaking (new fields) = AUTO-APPROVE
 * - flexible: All non-breaking = AUTO-APPROVE, Breaking = FAIL
 */
export const evaluateSchemaMode = (
  schemaMode: SchemaMode | undefined,
  comparison: SchemaComparison,
  hasHighConfidenceTransforms: boolean
): SchemaModeResult => {
  const hasChanges = comparison.changes.length > 0;

  // If no schema mode specified, use default dataset-based logic
  if (!schemaMode) {
    return { shouldFail: false, requiresApproval: false };
  }

  switch (schemaMode) {
    case "strict":
      // Any schema change causes failure
      if (hasChanges) {
        return {
          shouldFail: true,
          requiresApproval: false,
          failureReason: `Schema mismatch in strict mode: ${comparison.changes.length} change(s) detected`,
        };
      }
      return { shouldFail: false, requiresApproval: false };

    case "additive":
      // Breaking changes cause failure, non-breaking auto-approve
      if (comparison.isBreaking) {
        return {
          shouldFail: true,
          requiresApproval: false,
          failureReason: "Breaking schema changes not allowed in additive mode",
        };
      }
      // High-confidence transforms suggest field renames - require approval
      if (hasHighConfidenceTransforms) {
        return {
          shouldFail: false,
          requiresApproval: true,
          approvalReason: "Potential field renames detected - please confirm transforms",
        };
      }
      // Non-breaking changes auto-approve
      return { shouldFail: false, requiresApproval: false };

    case "flexible":
      // Breaking changes still fail, but all non-breaking changes auto-approve
      if (comparison.isBreaking) {
        return { shouldFail: true, requiresApproval: false, failureReason: "Breaking schema changes detected" };
      }
      // All non-breaking changes auto-approve (including transforms)
      return { shouldFail: false, requiresApproval: false };

    default:
      return { shouldFail: false, requiresApproval: false };
  }
};

// Helper function to determine if approval is required (for non-scheduled ingests)
const checkRequiresApproval = (
  comparison: SchemaComparison,
  dataset: { schemaConfig?: { locked?: boolean | null; autoApproveNonBreaking?: boolean | null } | null }
): boolean => comparison.isBreaking || !!dataset.schemaConfig?.locked || !dataset.schemaConfig?.autoApproveNonBreaking;

// Helper function to determine approval requirement based on schema mode and dataset config
export const determineRequiresApproval = (
  schemaModeRequiresApproval: boolean | undefined,
  schemaMode: string | undefined,
  comparison: SchemaComparison,
  dataset: { schemaConfig?: { locked?: boolean | null; autoApproveNonBreaking?: boolean | null } | null },
  hasHighConfidenceTransforms: boolean
): boolean => {
  // If schema mode explicitly requires approval, return true
  if (schemaModeRequiresApproval) {
    return true;
  }
  // If schema mode is set but doesn't require approval, it handled the decision
  if (schemaMode) {
    return false;
  }
  // Fall back to dataset config check
  return checkRequiresApproval(comparison, dataset) || hasHighConfidenceTransforms;
};

// Helper function to get approval reason
export const getApprovalReason = (hasHighConfidenceTransforms: boolean, isBreaking: boolean): string => {
  if (hasHighConfidenceTransforms) {
    return "Potential field renames detected";
  }
  if (isBreaking) {
    return "Breaking schema changes detected";
  }
  return "Manual approval required by dataset configuration";
};

/** Transform SchemaComparison changes into structured breaking/new-field lists for job output */
export const extractSchemaChanges = (comparison: SchemaComparison, detectedSchema: Record<string, unknown>) => {
  const breakingChanges = comparison.changes
    .filter((c) => c.severity === "error")
    .map((c) => ({
      field: c.path,
      change: c.type,
      ...(typeof c.details === "object" && c.details !== null ? (c.details as Record<string, unknown>) : {}),
    }));

  const newFields = comparison.changes
    .filter((c) => c.type === "new_field")
    .map((c) => {
      // Get the type from the detected schema properties
      const properties = detectedSchema.properties as Record<string, unknown> | undefined;
      const fieldSchema = properties?.[c.path] as Record<string, unknown> | undefined;
      const fieldType = fieldSchema?.type && typeof fieldSchema.type === "string" ? fieldSchema.type : "unknown";

      return {
        field: c.path,
        type: fieldType,
        optional:
          typeof c.details === "object" && c.details !== null && "required" in c.details ? !c.details.required : true,
      };
    });

  return { breakingChanges, newFields };
};
