/**
 * Admin API endpoint for cache cleanup operations.
 *
 * @module
 * @category API/Admin
 */

import { NextRequest, NextResponse } from "next/server";

import { CacheManager } from "@/lib/services/cache/manager";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/cache/cleanup
 * 
 * Triggers cleanup of expired cache entries.
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

    // Get specific cache name from query params
    const cacheName = request.nextUrl.searchParams.get("cache");
    
    if (cacheName) {
      // Clean specific cache
      const cache = CacheManager.getInstance(cacheName);
      if (!cache) {
        return NextResponse.json(
          { error: `Cache instance '${cacheName}' not found` },
          { status: 404 }
        );
      }

      const cleaned = await cache.cleanup();
      logger.info("Cache cleanup completed", { cache: cacheName, cleaned });

      return NextResponse.json({
        success: true,
        cache: cacheName,
        entriesCleaned: cleaned,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Clean all caches
      const totalCleaned = await CacheManager.cleanupAll();
      logger.info("All caches cleanup completed", { totalCleaned });

      return NextResponse.json({
        success: true,
        cache: "all",
        entriesCleaned: totalCleaned,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error("Cache cleanup failed", { error });
    return NextResponse.json(
      { error: "Cache cleanup failed" },
      { status: 500 }
    );
  }
}