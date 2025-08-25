/**
 * Admin API endpoint for cache clearing operations.
 *
 * @module
 * @category API/Admin
 */

import { NextRequest, NextResponse } from "next/server";

import { CacheManager } from "@/lib/services/cache/manager";
import { logger, logError } from "@/lib/logger";

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
export async function DELETE(request: NextRequest) {
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
    const tags = tagsParam ? tagsParam.split(",").map(t => t.trim()) : null;

    // Validate parameters
    if (!cacheName && !pattern && !tags) {
      // Clear all caches if no parameters provided
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
      // Clear specific cache
      const cache = CacheManager.getInstance(cacheName);
      if (!cache) {
        return NextResponse.json(
          { error: `Cache instance '${cacheName}' not found` },
          { status: 404 }
        );
      }

      if (tags) {
        // Invalidate by tags
        cleared = await cache.invalidateByTags(tags);
        logger.info("Cache invalidated by tags", { 
          cache: cacheName, 
          tags, 
          cleared 
        });
      } else {
        // Clear by pattern or all
        cleared = await cache.clear(pattern || undefined);
        logger.info("Cache cleared", { 
          cache: cacheName, 
          pattern, 
          cleared 
        });
      }
    } else {
      // Clear pattern across all caches
      if (pattern) {
        for (const [name, cache] of Object.entries(await CacheManager.getAllStats())) {
          const instanceName = name.split(":")[0];
          if (instanceName) {
            const instance = CacheManager.getInstance(instanceName);
            if (instance) {
              cleared += await instance.clear(pattern);
            }
          }
        }
        logger.info("Pattern cleared across all caches", { pattern, cleared });
      }
    }

    return NextResponse.json({
      success: true,
      entriesCleared: cleared,
      cache: cacheName || "all",
      pattern,
      tags,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error as Error, "Cache clear failed");
    return NextResponse.json(
      { error: "Cache clear operation failed" },
      { status: 500 }
    );
  }
}

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
export async function POST(request: NextRequest) {
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
        return NextResponse.json(
          { error: `Cache instance '${cacheName}' not found` },
          { status: 404 }
        );
      }

      if (tags && Array.isArray(tags)) {
        cleared = await cache.invalidateByTags(tags);
        logger.info("Cache invalidated by tags via POST", { 
          cache: cacheName, 
          tags, 
          cleared 
        });
      } else {
        cleared = await cache.clear(pattern || undefined);
        logger.info("Cache cleared via POST", { 
          cache: cacheName, 
          pattern, 
          cleared 
        });
      }
    }

    return NextResponse.json({
      success: true,
      entriesCleared: cleared,
      cache: cacheName || "all",
      pattern,
      tags,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error as Error, "Cache clear via POST failed");
    return NextResponse.json(
      { error: "Cache clear operation failed" },
      { status: 500 }
    );
  }
}