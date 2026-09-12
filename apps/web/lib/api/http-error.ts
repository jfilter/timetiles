/**
 * Client-side HTTP error class and fetch helper for React Query integration.
 *
 * `HttpError` carries the HTTP status code so the global retry function in
 * `providers.tsx` can skip retries on 4xx responses. `fetchJson` is a thin
 * wrapper around `fetch` that throws `HttpError` on non-ok responses.
 *
 * @module
 * @category API
 */

/**
 * Error subclass that preserves the HTTP status code from a failed response.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Extract a human-readable error message from a parsed response body.
 *
 * Prefers custom routes' `error` or `message` fields, then Payload's
 * `errors` array. Falls back when the body has no nonempty message.
 */
const extractErrorMessage = (body: unknown, fallback: string): string => {
  if (typeof body !== "object" || body === null) return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  if (Array.isArray(record.errors)) {
    for (const error of record.errors) {
      if (typeof error !== "object" || error === null) continue;
      const message: unknown = error.message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
};

/**
 * Thin wrapper around `fetch` that returns parsed JSON on success
 * and throws `HttpError` on non-ok responses.
 *
 * Uses the response body's message, including native Payload errors,
 * before falling back to HTTP status text or the numeric status.
 */
export const fetchJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message = extractErrorMessage(body, response.statusText.trim() || `HTTP ${response.status}`);
    throw new HttpError(response.status, message, body);
  }

  return response.json() as Promise<T>;
};

/**
 * Convenience wrapper for POST requests with JSON body.
 *
 * Sets `Content-Type`, `credentials: "include"`, and serializes the body.
 * Throws `HttpError` on non-ok responses (via `fetchJson`).
 */
export const postJson = <T>(url: string, data: unknown): Promise<T> =>
  fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
