/**
 * Generic factory for cached Payload CMS collection resolvers.
 *
 * Creates a resolver that looks up documents by a key field,
 * falls back to a default document, and caches results with
 * TTL-based expiration. Used by site-resolver and view-resolver.
 *
 * @module
 * @category Services
 */
import type { Payload, Where } from "payload";

import type { Config } from "@/payload-types";

import { logger } from "../logger";

type CollectionSlug = keyof Config["collections"];

interface CachedResolverOptions {
  /** Payload collection slug (e.g., "sites", "views") */
  collection: CollectionSlug;
  /** The field to match when looking up by key (e.g., "domain", "slug") */
  keyField: string;
  /** Optional scope field for multi-tenant lookups (e.g., "site" for views) */
  scopeField?: string;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number;
  /** Query depth for Payload find (default: 1) */
  depth?: number;
}

interface CachedResolver<T> {
  /** Find a document by its key field, optionally scoped */
  findByKey: (payload: Payload, key: string, scopeId?: number) => Promise<T | null>;
  /** Find the default document (isDefault: true), optionally scoped */
  findDefault: (payload: Payload, scopeId?: number) => Promise<T | null>;
  /** Clear all caches */
  clearCache: () => void;
}

export const createCachedResolver = <T>(options: CachedResolverOptions): CachedResolver<T> => {
  const { collection, keyField, scopeField, cacheTTL = 5 * 60 * 1000, depth = 1 } = options;

  // Caches
  const keyCache = new Map<string, T | null>();
  const defaultCache = new Map<string, T | null>();
  let lastCacheClear = Date.now();

  const maybeClearCache = (): void => {
    const now = Date.now();
    if (now - lastCacheClear > cacheTTL) {
      keyCache.clear();
      defaultCache.clear();
      lastCacheClear = now;
    }
  };

  const buildScopeWhere = (scopeId?: number): Where =>
    scopeField != null && scopeId != null ? { [scopeField]: { equals: scopeId } } : {};

  const cacheKeyFor = (key: string, scopeId?: number): string => (scopeField ? `${scopeId ?? "global"}:${key}` : key);

  const defaultCacheKey = (scopeId?: number): string => (scopeField ? String(scopeId ?? 0) : "_default");

  const findByKey = async (payload: Payload, key: string, scopeId?: number): Promise<T | null> => {
    maybeClearCache();

    const ck = cacheKeyFor(key, scopeId);
    if (keyCache.has(ck)) {
      return keyCache.get(ck) ?? null;
    }

    try {
      const where: Where = {
        [keyField]: { equals: key },
        _status: { equals: "published" },
        ...buildScopeWhere(scopeId),
      };

      const result = await payload.find({ collection, where, limit: 1, sort: "createdAt", depth });
      const doc = (result.docs[0] as T | undefined) ?? null;
      keyCache.set(ck, doc);
      return doc;
    } catch (error) {
      logger.error({ error, [keyField]: key, collection }, `Error finding ${collection} by ${keyField}`);
      return null;
    }
  };

  const findDefault = async (payload: Payload, scopeId?: number): Promise<T | null> => {
    maybeClearCache();

    const dk = defaultCacheKey(scopeId);
    if (defaultCache.has(dk)) {
      return defaultCache.get(dk) ?? null;
    }

    try {
      const where: Where = {
        isDefault: { equals: true },
        _status: { equals: "published" },
        ...buildScopeWhere(scopeId),
      };

      const result = await payload.find({ collection, where, limit: 1, depth });
      const doc = (result.docs[0] as T | undefined) ?? null;
      defaultCache.set(dk, doc);
      return doc;
    } catch (error) {
      logger.error({ error, collection }, `Error finding default ${collection}`);
      return null;
    }
  };

  const clearCache = (): void => {
    keyCache.clear();
    defaultCache.clear();
    lastCacheClear = Date.now();
  };

  return { findByKey, findDefault, clearCache };
};
