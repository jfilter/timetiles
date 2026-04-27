/**
 * Authentication utilities for URL fetch jobs.
 *
 * Handles building HTTP headers for various authentication methods including
 * API keys, bearer tokens, basic auth, and custom headers.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import { validateCustomHeaders } from "@/lib/ingest/validate-custom-headers";
import { createLogger } from "@/lib/logger";
import { safeFetch } from "@/lib/security/safe-fetch";
import type { ScheduledIngest } from "@/payload-types";

const logger = createLogger("url-fetch-auth");

/**
 * Exchange OAuth credentials for an access token via Resource Owner Password Grant.
 *
 * Uses `safeFetch` to prevent SSRF — `tokenUrl` is user-controlled via
 * `scheduledIngest.authConfig.oauthTokenUrl`.
 */
const fetchOAuthToken = async (
  tokenUrl: string,
  clientId: string,
  username: string,
  password: string
): Promise<string> => {
  const response = await safeFetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: clientId, username, password }),
  });

  if (!response.ok) {
    // Only read the body on 4xx/5xx — safeFetch already validated the URL and
    // all redirects, so any response we see here came from an approved host.
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

/**
 * Merge user-supplied custom headers from authConfig into the outgoing
 * header bag. Runtime defense: if the saved config is invalid (saved before
 * validation was introduced, or smuggled via the REST API bypassing
 * collection hooks), we log a warning and skip the bad headers rather than
 * failing the whole URL-fetch job.
 */
const applyCustomHeaders = (headers: Record<string, string>, customHeaders: unknown): void => {
  if (!customHeaders) return;
  const result = validateCustomHeaders(customHeaders);
  if (!result.ok) {
    logger.warn("Ignoring invalid customHeaders on scheduled ingest", { reason: result.error });
    return;
  }
  Object.assign(headers, result.headers ?? {});
};

/**
 * Builds HTTP headers based on authentication configuration.
 * Async because OAuth requires a token exchange request.
 */
export const buildAuthHeaders = async (
  authConfig: ScheduledIngest["authConfig"] | undefined
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { "User-Agent": "TimeTiles/1.0 (Data Import Service)" };

  if (!authConfig) {
    return headers;
  }

  switch (authConfig.type) {
    case "none":
      break;
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
