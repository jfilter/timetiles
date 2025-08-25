# HTTP Cache System Documentation

## Overview

The HTTP cache system provides efficient caching for outgoing HTTP requests, particularly for scheduled URL imports. It supports multiple storage backends, intelligent cache invalidation, and comprehensive management APIs.

## Architecture

### Components

1. **Cache Storage Backends**
   - `MemoryCacheStorage`: In-memory LRU cache for development/testing
   - `FileSystemCacheStorage`: Persistent file-based storage for production

2. **Cache Service**
   - `Cache`: Core caching service with key prefixing and error handling
   - `CacheManager`: Factory and lifecycle management for cache instances

3. **HTTP Cache**
   - `HttpCache`: HTTP-specific caching with ETag, Cache-Control support
   - Handles 304 Not Modified responses
   - Respects server cache directives

4. **Integration**
   - URL fetch job integration for scheduled imports
   - Configurable via scheduled import settings

## Features

### Storage Backends

#### Memory Storage
- LRU eviction policy
- Configurable max entries and size
- Fast access, no persistence
- Ideal for development

#### File System Storage
- Persistent across restarts
- Hierarchical file organization
- Index for fast lookups
- Automatic cleanup of stale entries

### HTTP Caching Features

- **ETag Support**: Conditional requests with If-None-Match
- **Last-Modified**: Conditional requests with If-Modified-Since
- **Cache-Control**: Respects max-age, no-cache, no-store directives
- **304 Handling**: Efficient revalidation without re-downloading
- **Content Types**: Supports JSON, XML, HTML, text, binary data

### Cache Management

- Pattern-based invalidation
- Tag-based invalidation
- TTL support
- Statistics tracking
- Cleanup operations

## Configuration

### Environment Variables

```bash
# Cache backend selection
CACHE_BACKEND=filesystem  # or "memory"

# Default TTL in seconds
CACHE_DEFAULT_TTL=3600

# Maximum cache size in MB
CACHE_MAX_SIZE_MB=500

# Maximum entries (memory backend)
CACHE_MAX_ENTRIES=1000

# Cache directory (filesystem backend)
CACHE_DIR=.cache

# Cleanup interval in milliseconds
CACHE_CLEANUP_INTERVAL_MS=3600000
```

### Scheduled Import Settings

When configuring scheduled imports, the following cache options are available:

- `useHttpCache`: Enable/disable HTTP caching (default: true)
- `bypassCacheOnManual`: Bypass cache for manual triggers (default: false)
- `respectCacheControl`: Honor server Cache-Control headers (default: true)

## Admin API Endpoints

All admin endpoints require authentication (TODO: implement auth check).

### GET /api/admin/cache/stats
Get cache statistics for all instances or a specific cache.

**Query Parameters:**
- `cache`: (optional) Name of specific cache instance

**Response:**
```json
{
  "timestamp": "2025-08-25T20:00:00Z",
  "aggregate": {
    "totalEntries": 150,
    "totalSize": 5242880,
    "totalHits": 1200,
    "totalMisses": 300,
    "hitRate": 80.0
  },
  "caches": {
    "http:default": { ... }
  }
}
```

### POST /api/admin/cache/cleanup
Trigger cleanup of expired entries.

**Query Parameters:**
- `cache`: (optional) Specific cache to clean

### DELETE /api/admin/cache/clear
Clear cache entries.

**Query Parameters:**
- `cache`: (optional) Specific cache instance
- `pattern`: (optional) Pattern to match keys
- `tags`: (optional) Comma-separated tags

### GET /api/admin/cache/entry
Retrieve a specific cache entry.

**Query Parameters:**
- `cache`: (required) Cache instance name
- `key`: (required) Cache key

### GET /api/admin/cache/keys
List cache keys.

**Query Parameters:**
- `cache`: (required) Cache instance name
- `pattern`: (optional) Pattern to match
- `limit`: (optional) Max keys to return (default: 100)
- `offset`: (optional) Pagination offset
- `metadata`: (optional) Include metadata (true/false)

## Usage Examples

### Programmatic Usage

```typescript
import { CacheManager, CacheBackend } from "@/lib/services/cache";
import { HttpCache } from "@/lib/services/cache/http-cache";

// Get or create a cache instance
const cache = CacheManager.getCache("my-cache", CacheBackend.FILESYSTEM);

// Create HTTP cache wrapper
const httpCache = new HttpCache(cache);

// Fetch with caching
const response = await httpCache.fetch("https://api.example.com/data");

// Check cache status
const cacheHit = response.headers.get("X-Cache") === "HIT";
```

### URL Fetch Job Integration

The URL fetch job automatically uses the HTTP cache when configured:

```typescript
// In scheduled import configuration
{
  advancedOptions: {
    useHttpCache: true,
    bypassCacheOnManual: false,
    respectCacheControl: true
  }
}
```

## Testing

### Unit Tests

```bash
# Run memory storage tests
npx vitest run tests/unit/services/cache/memory.test.ts

# Run file system storage tests
npx vitest run tests/unit/services/cache/file-system.test.ts
```

### Integration Tests

```bash
# Run HTTP cache integration tests
npx vitest run tests/integration/services/http-cache.test.ts
```

## Performance Considerations

1. **Memory Backend**: Fast but limited by available RAM
2. **File System Backend**: Slower but persistent and scalable
3. **Cache Keys**: Use hierarchical keys for efficient pattern matching
4. **TTL Strategy**: Balance between freshness and cache efficiency
5. **Cleanup**: Schedule regular cleanup to prevent unbounded growth

## Future Enhancements

1. **Redis Backend**: For distributed caching across instances
2. **Cache Warming**: Proactive cache population
3. **Compression**: Compress large cached values
4. **Metrics Integration**: Export cache metrics to monitoring systems
5. **Authentication**: Implement proper admin authentication
6. **UI Dashboard**: Visual cache management interface

## Troubleshooting

### Common Issues

1. **Cache Misses**: Check TTL settings and Cache-Control headers
2. **Stale Data**: Verify revalidation is working (ETag/Last-Modified)
3. **Disk Space**: Monitor file system cache directory size
4. **Memory Usage**: Adjust max entries/size for memory backend
5. **Test Failures**: Some tests may fail when run together due to shared state

### Debug Logging

Enable debug logging for cache operations:

```typescript
import { logger } from "@/lib/logger";

// Cache operations are logged at info level
logger.info("Cache hit", { key, cache: "http" });
```

## Security Considerations

1. **Sensitive Data**: Avoid caching sensitive information
2. **Authentication**: Cache keys should include auth context
3. **Access Control**: Admin endpoints need authentication (TODO)
4. **Cache Poisoning**: Validate cached data on retrieval
5. **File Permissions**: Secure file system cache directory