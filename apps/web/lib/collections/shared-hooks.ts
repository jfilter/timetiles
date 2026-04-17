/**
 * Shared collection hook factories.
 *
 * @module
 * @category Collections
 */
import type { CollectionBeforeChangeHook, Payload, PayloadRequest, TypeWithID, Where } from "payload";

import { extractRelationId } from "@/lib/utils/relation-id";
import type { Config } from "@/payload-types";

type CollectionSlug = keyof Config["collections"];

interface RelationOwnershipOptions {
  /** Collection slug of the related document to fetch. */
  collection: CollectionSlug;
  /** ID of the related document. */
  id: number;
  /** Field on the related document that holds the owner reference. */
  userField: string;
  /** ID of the user who should own the related document. */
  userId: number;
  /** Error message thrown when ownership does not match. */
  errorMessage: string;
  /** Optional request to reuse the active Payload transaction. */
  req?: PayloadRequest;
}

/**
 * Validate that a user owns a related resource.
 *
 * Fetches the related document and checks if the specified user field
 * matches the given user ID. Throws if the ownership check fails.
 */
export const validateRelationOwnership = async (payload: Payload, opts: RelationOwnershipOptions): Promise<void> => {
  const doc = await payload.findByID({ collection: opts.collection, id: opts.id, overrideAccess: true, req: opts.req });
  const ownerId = extractRelationId((doc as unknown as Record<string, unknown>)?.[opts.userField]);
  if (ownerId !== opts.userId) {
    throw new Error(opts.errorMessage);
  }
};

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
