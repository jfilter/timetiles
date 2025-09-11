/**
 * Admin API endpoint for cache statistics.
 *
 * @module
 * @category API/Admin
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { CacheManager } from "@/lib/services/cache/manager";

/**
 * GET /api/admin/cache/stats
 *
 * Returns cache statistics for all cache instances.
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

    // Get stats for all cache instances
    const allStats = await CacheManager.getAllStats();

    // Get individual cache stats if specific cache requested
    const cacheName = request.nextUrl.searchParams.get("cache");
    if (cacheName) {
      const cache = CacheManager.getInstance(cacheName);
      if (!cache) {
        return NextResponse.json({ error: `Cache instance '${cacheName}' not found` }, { status: 404 });
      }

      const stats = await cache.getStats();
      return NextResponse.json({
        cache: cacheName,
        stats,
      });
    }

    // Calculate aggregate statistics
    const aggregate = {
      totalEntries: 0,
      totalSize: 0,
      totalHits: 0,
      totalMisses: 0,
      totalEvictions: 0,
      hitRate: 0,
    };

    for (const stats of Object.values(allStats)) {
      aggregate.totalEntries += stats.entries || 0;
      aggregate.totalSize += stats.totalSize || 0;
      aggregate.totalHits += stats.hits || 0;
      aggregate.totalMisses += stats.misses || 0;
      aggregate.totalEvictions += stats.evictions || 0;
    }

    // Calculate hit rate
    const totalRequests = aggregate.totalHits + aggregate.totalMisses;
    if (totalRequests > 0) {
      aggregate.hitRate = (aggregate.totalHits / totalRequests) * 100;
    }

    logger.info("Cache stats retrieved", {
      caches: Object.keys(allStats).length,
      totalEntries: aggregate.totalEntries,
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      aggregate,
      caches: allStats,
    });
  } catch (error) {
    logger.error("Failed to get cache stats", { error });
    return NextResponse.json({ error: "Failed to retrieve cache statistics" }, { status: 500 });
  }
};
