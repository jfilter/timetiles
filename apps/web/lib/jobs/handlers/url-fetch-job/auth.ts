/**
 * Authentication utilities for URL fetch jobs.
 *
 * Handles building HTTP headers for various authentication methods including
 * API keys, bearer tokens, basic auth, and custom headers.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import { createLogger } from "@/lib/logger";
import type { ScheduledIngest } from "@/payload-types";

const logger = createLogger("url-fetch-auth");

/**
 * Exchange OAuth credentials for an access token via Resource Owner Password Grant.
 */
const fetchOAuthToken = async (
  tokenUrl: string,
  clientId: string,
  username: string,
  password: string
): Promise<string> => {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: clientId, username, password }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OAuth token request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("OAuth response missing access_token");
  }

  logger.debug("OAuth token obtained", { tokenUrl });
  return data.access_token;
};

/** Merge custom headers from authConfig JSON into the headers object. */
const applyCustomHeaders = (headers: Record<string, string>, customHeaders: unknown): void => {
  if (!customHeaders) return;
  try {
    const parsed = typeof customHeaders === "string" ? JSON.parse(customHeaders) : customHeaders;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      Object.assign(headers, parsed);
    }
  } catch {
    // Ignore invalid custom headers
  }
};

/**
 * Builds HTTP headers based on authentication configuration.
 * Async because OAuth requires a token exchange request.
 */
export const buildAuthHeaders = async (
  authConfig: ScheduledIngest["authConfig"] | undefined
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { "User-Agent": "TimeTiles/1.0 (Data Import Service)" };

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
        const credentials = Buffer.from(authConfig.username + ":" + authConfig.password).toString("base64");
        headers.Authorization = "Basic " + credentials;
      }
      break;
    case "oauth": {
      if (!authConfig.tokenUrl || !authConfig.username || !authConfig.password) break;
      const token = await fetchOAuthToken(
        authConfig.tokenUrl,
        authConfig.clientId ?? "",
        authConfig.username,
        authConfig.password
      );
      headers.Authorization = `Bearer ${token}`;
      break;
    }
  }

  applyCustomHeaders(headers, authConfig.customHeaders);
  return headers;
};
