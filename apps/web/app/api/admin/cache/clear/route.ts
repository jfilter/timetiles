/**
 * Admin API endpoint for cache clearing operations.
 *
 * @module
 * @category API/Admin
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logError, logger } from "@/lib/logger";
import { CacheManager } from "@/lib/services/cache/manager";

/**
 * Helper to clear a specific cache instance
 */
const clearSpecificCache = async (
  cacheName: string,
  pattern: string | null,
  tags: string[] | null
): Promise<{ cleared: number; notFound?: boolean }> => {
  const cache = CacheManager.getInstance(cacheName);
  if (!cache) {
    return { cleared: 0, notFound: true };
  }

  let cleared = 0;
  if (tags) {
    cleared = await cache.invalidateByTags(tags);
    logger.info("Cache invalidated by tags", { cache: cacheName, tags, cleared });
  } else {
    cleared = await cache.clear(pattern ?? undefined);
    logger.info("Cache cleared", { cache: cacheName, pattern, cleared });
  }

  return { cleared };
};

/**
 * Helper to clear pattern across all caches
 */
const clearPatternAcrossAllCaches = async (pattern: string): Promise<number> => {
  let cleared = 0;
  const stats = await CacheManager.getAllStats();

  for (const [name] of Object.entries(stats)) {
    const instanceName = name.split(":")[0];
    if (instanceName) {
      const instance = CacheManager.getInstance(instanceName);
      if (instance) {
        cleared += await instance.clear(pattern);
      }
    }
  }

  logger.info("Pattern cleared across all caches", { pattern, cleared });
  return cleared;
};

/**
 * DELETE /api/admin/cache/clear
 *
 * Clears cache entries matching a pattern or all entries.
 *
 * Query parameters:
 * - cache: Name of specific cache instance (optional)
 * - pattern: Pattern to match keys for deletion (optional)
 * - tags: Comma-separated tags to invalidate by (optional)
 *
 * @requires Admin authentication
 */
export const DELETE = async (request: NextRequest) => {
  try {
    // TODO: Add authentication check
    // const user = await authenticateAdmin(request);
    // if (!user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const searchParams = request.nextUrl.searchParams;
    const cacheName = searchParams.get("cache");
    const pattern = searchParams.get("pattern");
    const tagsParam = searchParams.get("tags");
    const tags = tagsParam ? tagsParam.split(",").map((t) => t.trim()) : null;

    // Clear all caches if no parameters provided
    if (!cacheName && !pattern && !tags) {
      await CacheManager.clearAll();
      logger.info("All caches cleared");
      return NextResponse.json({
        success: true,
        message: "All caches cleared",
        timestamp: new Date().toISOString(),
      });
    }

    let cleared = 0;

    if (cacheName) {
      const result = await clearSpecificCache(cacheName, pattern, tags);
      if (result.notFound) {
        return NextResponse.json({ error: `Cache instance '${cacheName}' not found` }, { status: 404 });
      }
      cleared = result.cleared;
    } else if (pattern) {
      cleared = await clearPatternAcrossAllCaches(pattern);
    }

    return NextResponse.json({
      success: true,
      entriesCleared: cleared,
      cache: cacheName ?? "all",
      pattern,
      tags,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error as Error, "Cache clear failed");
    return NextResponse.json({ error: "Cache clear operation failed" }, { status: 500 });
  }
};

/**
 * POST /api/admin/cache/clear
 *
 * Alternative method for clearing cache (for clients that don't support DELETE with body).
 *
 * Request body:
 * - cache: Name of specific cache instance (optional)
 * - pattern: Pattern to match keys for deletion (optional)
 * - tags: Array of tags to invalidate by (optional)
 *
 * @requires Admin authentication
 */
export const POST = async (request: NextRequest) => {
  try {
    // TODO: Add authentication check
    // const user = await authenticateAdmin(request);
    // if (!user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const body = await request.json();
    const { cache: cacheName, pattern, tags } = body;

    let cleared = 0;

    if (!cacheName && !pattern && !tags) {
      // Clear all caches if no parameters provided
      await CacheManager.clearAll();
      logger.info("All caches cleared via POST");

      return NextResponse.json({
        success: true,
        message: "All caches cleared",
        timestamp: new Date().toISOString(),
      });
    }

    if (cacheName) {
      const cache = CacheManager.getInstance(cacheName);
      if (!cache) {
        return NextResponse.json({ error: `Cache instance '${cacheName}' not found` }, { status: 404 });
      }

      if (tags && Array.isArray(tags)) {
        cleared = await cache.invalidateByTags(tags);
        logger.info("Cache invalidated by tags via POST", {
          cache: cacheName,
          tags,
          cleared,
        });
      } else {
        cleared = await cache.clear(pattern ?? undefined);
        logger.info("Cache cleared via POST", {
          cache: cacheName,
          pattern,
          cleared,
        });
      }
    }

    return NextResponse.json({
      success: true,
      entriesCleared: cleared,
      cache: cacheName ?? "all",
      pattern,
      tags,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error as Error, "Cache clear via POST failed");
    return NextResponse.json({ error: "Cache clear operation failed" }, { status: 500 });
  }
};
