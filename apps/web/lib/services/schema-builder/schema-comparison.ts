/**
 * Schema comparison utilities for detecting changes.
 *
 * Contains functions for comparing schemas, detecting breaking changes,
 * and generating comparison reports.
 *
 * @module
 * @category Services/SchemaBuilder
 */

import type { SchemaChange, SchemaComparison } from "@/lib/types/schema-detection";

/**
 * Compares two schemas and identifies changes
 */
export const compareSchemas = (
  oldSchema: Record<string, unknown>,
  newSchema: Record<string, unknown>
): SchemaComparison => {
  const changes: SchemaChange[] = [];

  const oldProps = (oldSchema.properties as Record<string, unknown>) ?? {};
  const newProps = (newSchema.properties as Record<string, unknown>) ?? {};

  // Debug check for test environment
  if (process.env.NODE_ENV === "test" && Object.keys(oldProps).length === 0 && oldSchema.properties) {
    // oldProps is empty but oldSchema.properties exists - this shouldn't happen
  }

  const oldRequired = (oldSchema.required as string[]) ?? [];
  const newRequired = (newSchema.required as string[]) ?? [];

  let isBreaking = false;

  // Check for removed fields (breaking)
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
      isBreaking = true;
    }
  }

  // Check for added fields (non-breaking if optional)
  for (const field of Object.keys(newProps)) {
    if (!oldProps[field]) {
      const isRequired = newRequired.includes(field);
      const change: SchemaChange = {
        type: "new_field",
        path: field,
        details: {
          description: `Field '${field}' was added${isRequired ? " (required)" : ""}`,
          required: isRequired,
        },
        severity: isRequired ? "error" : "info",
        autoApprovable: !isRequired,
      };
      changes.push(change);
      if (isRequired) {
        isBreaking = true;
      }
    }
  }

  // Check for type changes and enum changes
  for (const field of Object.keys(oldProps)) {
    if (newProps[field]) {
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
        isBreaking = true;
      } else if (oldProp.enum && newProp.enum) {
        // Check for enum changes
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
          if (removed.length > 0) {
            isBreaking = true;
          }
        }
      }
    }
  }

  // Check for required field changes
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
      isBreaking = true;
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
 * Gets the type of a field from schema property
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

  if (property.oneOf || property.anyOf) {
    return "union";
  }

  if (property.enum) {
    return "enum";
  }

  return "unknown";
};

/**
 * Generates a human-readable summary of schema changes
 */
export const generateChangeSummary = (comparison: SchemaComparison): string => {
  const lines: string[] = [];

  if (comparison.changes.length === 0) {
    return "No schema changes detected";
  }

  lines.push(`Schema Changes Summary:`);
  lines.push(`- Total changes: ${comparison.changes.length}`);
  lines.push(`- Breaking changes: ${comparison.isBreaking ? "Yes" : "No"}`);
  lines.push(`- Requires approval: ${comparison.requiresApproval ? "Yes" : "No"}`);
  lines.push(`- Can auto-approve: ${comparison.canAutoApprove ? "Yes" : "No"}`);

  const breakingChanges = comparison.changes.filter((c) => c.severity === "error");
  if (breakingChanges.length > 0) {
    lines.push("");
    lines.push("Breaking Changes:");
    for (const change of breakingChanges) {
      const details = change.details as { description?: string };
      const fallback = change.type + " at " + change.path;
      lines.push(`  - ${details.description ?? fallback}`);
    }
  }

  const nonBreaking = comparison.changes.filter((c) => c.severity !== "error");
  if (nonBreaking.length > 0) {
    lines.push("");
    lines.push("Non-Breaking Changes:");
    for (const change of nonBreaking) {
      const details = change.details as { description?: string };
      const fallback = change.type + " at " + change.path;
      lines.push(`  - ${details.description ?? fallback}`);
    }
  }

  return lines.join("\n");
};
