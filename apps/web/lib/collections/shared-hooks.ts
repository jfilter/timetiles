/**
 * Shared collection hook factories.
 *
 * @module
 * @category Collections
 */
import type { CollectionBeforeChangeHook, TypeWithID, Where } from "payload";

import type { Config } from "@/payload-types";

type CollectionSlug = keyof Config["collections"];

interface SingleDefaultOptions {
  /** Payload collection slug */
  collection: CollectionSlug;
  /**
   * Optional scope field name and extractor. When provided, the default
   * uniqueness is enforced within the scope (e.g., per-site for views).
   */
  scope?: { field: string; getId: (data: Record<string, unknown>) => number | undefined };
}

/**
 * Creates a beforeChange hook that enforces at most one document
 * with `isDefault: true` (optionally scoped by a parent relation).
 *
 * Used by both Sites (global scope) and Views (scoped to site).
 */
export const createEnforceSingleDefault = <T extends TypeWithID = TypeWithID>(
  options: SingleDefaultOptions
): CollectionBeforeChangeHook<T> => {
  const { collection, scope } = options;

  return async ({ data, req, operation, originalDoc, context }) => {
    if (context?.skipEnforceSingleDefault) {
      return data;
    }

    const wasDefault = (originalDoc as Record<string, unknown> | undefined)?.isDefault ?? false;
    const isNowDefault = (data as Record<string, unknown>).isDefault ?? false;

    if (isNowDefault && !wasDefault) {
      const scopeId = scope?.getId(data as Record<string, unknown>);
      if (scope && scopeId == null) {
        return data;
      }

      const idFilter =
        operation === "update" && (originalDoc as Record<string, unknown> | undefined)?.id
          ? { not_equals: (originalDoc as Record<string, unknown>).id }
          : undefined;

      const where: Where = {
        isDefault: { equals: true },
        ...(idFilter && { id: idFilter }),
        ...(scope && scopeId != null && { [scope.field]: { equals: scopeId } }),
      };

      // Type assertion needed because Payload's update() overloads require
      // a literal collection slug to resolve the data shape, but this
      // factory operates generically across collections.
      type UpdateArgs = {
        collection: CollectionSlug;
        where: Where;
        data: Record<string, unknown>;
        depth: number;
        overrideAccess: boolean;
        context: Record<string, unknown>;
      };
      await (req.payload.update as (args: UpdateArgs) => Promise<unknown>)({
        collection,
        where,
        data: { isDefault: false },
        depth: 0,
        overrideAccess: true,
        context: { skipEnforceSingleDefault: true },
      });
    }

    return data;
  };
};
