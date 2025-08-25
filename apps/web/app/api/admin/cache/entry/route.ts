/**
 * Admin API endpoint for cache entry inspection.
 *
 * @module
 * @category API/Admin
 */

import { NextRequest, NextResponse } from "next/server";

import { CacheManager } from "@/lib/services/cache/manager";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/cache/entry
 * 
 * Retrieves a specific cache entry for inspection.
 * 
 * Query parameters:
 * - cache: Name of cache instance (required)
 * - key: Cache key to retrieve (required)
 * 
 * @requires Admin authentication
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Add authentication check
    // const user = await authenticateAdmin(request);
    // if (!user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const searchParams = request.nextUrl.searchParams;
    const cacheName = searchParams.get("cache");
    const key = searchParams.get("key");

    if (!cacheName || !key) {
      return NextResponse.json(
        { error: "Both 'cache' and 'key' parameters are required" },
        { status: 400 }
      );
    }

    const cache = CacheManager.getInstance(cacheName);
    if (!cache) {
      return NextResponse.json(
        { error: `Cache instance '${cacheName}' not found` },
        { status: 404 }
      );
    }

    const value = await cache.get(key);
    if (value === null || value === undefined) {
      return NextResponse.json(
        { error: `Key '${key}' not found in cache '${cacheName}'` },
        { status: 404 }
      );
    }

    // Try to get cache entry metadata if available
    const metadata = (value as any)?.metadata;
    
    // Calculate useful metrics
    const now = new Date();
    const age = metadata?.createdAt 
      ? Math.floor((now.getTime() - new Date(metadata.createdAt).getTime()) / 1000)
      : null;
    
    const ttlRemaining = metadata?.expiresAt
      ? Math.max(0, Math.floor((new Date(metadata.expiresAt).getTime() - now.getTime()) / 1000))
      : null;

    logger.info("Cache entry retrieved", { 
      cache: cacheName, 
      key,
      size: metadata?.size 
    });

    return NextResponse.json({
      cache: cacheName,
      key,
      value,
      metadata,
      metrics: {
        age,
        ttlRemaining,
        accessCount: metadata?.accessCount || 0,
        size: metadata?.size || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get cache entry", { error });
    return NextResponse.json(
      { error: "Failed to retrieve cache entry" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/cache/entry
 * 
 * Updates or creates a cache entry.
 * 
 * Request body:
 * - cache: Name of cache instance (required)
 * - key: Cache key (required)
 * - value: Value to cache (required)
 * - ttl: Time to live in seconds (optional)
 * - tags: Array of tags (optional)
 * 
 * @requires Admin authentication
 */
export async function PUT(request: NextRequest) {
  try {
    // TODO: Add authentication check
    // const user = await authenticateAdmin(request);
    // if (!user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const body = await request.json();
    const { cache: cacheName, key, value, ttl, tags } = body;

    if (!cacheName || !key || value === undefined) {
      return NextResponse.json(
        { error: "'cache', 'key', and 'value' are required" },
        { status: 400 }
      );
    }

    const cache = CacheManager.getInstance(cacheName);
    if (!cache) {
      return NextResponse.json(
        { error: `Cache instance '${cacheName}' not found` },
        { status: 404 }
      );
    }

    await cache.set(key, value, { ttl, tags });

    logger.info("Cache entry updated", { 
      cache: cacheName, 
      key,
      ttl,
      tags 
    });

    return NextResponse.json({
      success: true,
      cache: cacheName,
      key,
      message: "Cache entry updated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to update cache entry", { error });
    return NextResponse.json(
      { error: "Failed to update cache entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/cache/entry
 * 
 * Deletes a specific cache entry.
 * 
 * Query parameters:
 * - cache: Name of cache instance (required)
 * - key: Cache key to delete (required)
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
    const key = searchParams.get("key");

    if (!cacheName || !key) {
      return NextResponse.json(
        { error: "Both 'cache' and 'key' parameters are required" },
        { status: 400 }
      );
    }

    const cache = CacheManager.getInstance(cacheName);
    if (!cache) {
      return NextResponse.json(
        { error: `Cache instance '${cacheName}' not found` },
        { status: 404 }
      );
    }

    const deleted = await cache.delete(key);

    logger.info("Cache entry deletion attempted", { 
      cache: cacheName, 
      key,
      deleted 
    });

    return NextResponse.json({
      success: deleted,
      cache: cacheName,
      key,
      message: deleted ? "Cache entry deleted successfully" : "Entry not found",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to delete cache entry", { error });
    return NextResponse.json(
      { error: "Failed to delete cache entry" },
      { status: 500 }
    );
  }
}