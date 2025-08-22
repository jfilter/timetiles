/**
 * Authentication utilities for URL fetch jobs.
 *
 * Handles building HTTP headers for various authentication methods including
 * API keys, bearer tokens, basic auth, and custom headers.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import type { ScheduledImport } from "@/payload-types";

/**
 * Builds HTTP headers based on authentication configuration.
 */
export const buildAuthHeaders = (authConfig: ScheduledImport["authConfig"] | undefined): Record<string, string> => {
  const headers: Record<string, string> = {
    "User-Agent": "TimeTiles/1.0 (Data Import Service)",
  };

  if (!authConfig || authConfig.type === "none") {
    return headers;
  }

  switch (authConfig.type) {
    case "api-key":
      if (authConfig.apiKey && authConfig.apiKeyHeader) {
        headers[authConfig.apiKeyHeader] = authConfig.apiKey;
      }
      break;
    case "bearer":
      if (authConfig.bearerToken) {
        headers.Authorization = `Bearer ${authConfig.bearerToken}`;
      }
      break;
    case "basic":
      if (authConfig.username && authConfig.password) {
        const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString("base64");
        headers.Authorization = `Basic ${credentials}`;
      }
      break;
  }

  // Parse and add any custom headers from authConfig
  if (authConfig.customHeaders) {
    try {
      const additionalHeaders =
        typeof authConfig.customHeaders === "string" ? JSON.parse(authConfig.customHeaders) : authConfig.customHeaders;

      if (typeof additionalHeaders === "object" && additionalHeaders !== null && !Array.isArray(additionalHeaders)) {
        Object.assign(headers, additionalHeaders);
      }
    } catch {
      // Ignore invalid custom headers - intentionally ignoring parse errors
    }
  }

  return headers;
};
