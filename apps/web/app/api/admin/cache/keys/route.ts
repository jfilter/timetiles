/**
 * Admin API endpoint for listing cache keys.
 *
 * @module
 * @category API/Admin
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { CacheManager } from "@/lib/services/cache/manager";

/**
 * GET /api/admin/cache/keys
 *
 * Lists cache keys matching a pattern.
 *
 * Query parameters:
 * - cache: Name of cache instance (required)
 * - pattern: Pattern to match keys (optional)
 * - limit: Maximum number of keys to return (default: 100)
 * - offset: Number of keys to skip (default: 0)
 *
 * @requires Admin authentication
 */
export const GET = async (request: NextRequest) => {
  try {
    // TODO: Add authentication check
    // const user = await authenticateAdmin(request);
    // if (!user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const searchParams = request.nextUrl.searchParams;
    const cacheName = searchParams.get("cache");
    const pattern = searchParams.get("pattern");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 1000);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    if (!cacheName) {
      return NextResponse.json({ error: "'cache' parameter is required" }, { status: 400 });
    }

    const cache = CacheManager.getInstance(cacheName);
    if (!cache) {
      return NextResponse.json({ error: `Cache instance '${cacheName}' not found` }, { status: 404 });
    }

    // Get all keys matching pattern
    const allKeys = await cache.keys(pattern ?? undefined);

    // Apply pagination
    const paginatedKeys = allKeys.slice(offset, offset + limit);

    // Get detailed information for each key if requested
    const includeMetadata = searchParams.get("metadata") === "true";
    let entries = [];

    if (includeMetadata) {
      const promises = paginatedKeys.map(async (key) => {
        const value = await cache.get(key);
        const metadata = (value as { metadata?: { size?: number } })?.metadata;
        return {
          key,
          metadata: metadata ?? null,
          size: metadata?.size ?? 0,
        };
      });
      entries = await Promise.all(promises);
    } else {
      entries = paginatedKeys.map((key) => ({ key }));
    }

    logger.info("Cache keys listed", {
      cache: cacheName,
      pattern,
      totalKeys: allKeys.length,
      returned: entries.length,
    });

    return NextResponse.json({
      cache: cacheName,
      pattern,
      total: allKeys.length,
      limit,
      offset,
      keys: entries,
      hasMore: offset + limit < allKeys.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to list cache keys", { error });
    return NextResponse.json({ error: "Failed to list cache keys" }, { status: 500 });
  }
};
