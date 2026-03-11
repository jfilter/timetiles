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
 * Looks for an `error` or `message` string field, which is the convention
 * used by all API routes in this codebase. Falls back to `fallback` when
 * the body doesn't contain a recognizable message.
 */
const extractErrorMessage = (body: unknown, fallback: string): string => {
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return fallback;
};

/**
 * Thin wrapper around `fetch` that returns parsed JSON on success
 * and throws `HttpError` on non-ok responses.
 *
 * When the response body contains an `error` or `message` string field,
 * that value is used as the `HttpError` message so consumers get
 * descriptive errors instead of generic HTTP status text.
 */
export const fetchJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message = extractErrorMessage(body, response.statusText);
    throw new HttpError(response.status, message, body);
  }

  return response.json() as Promise<T>;
};
