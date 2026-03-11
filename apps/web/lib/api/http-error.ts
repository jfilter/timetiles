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
 * Thin wrapper around `fetch` that returns parsed JSON on success
 * and throws `HttpError` on non-ok responses.
 */
export const fetchJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new HttpError(response.status, response.statusText, body);
  }

  return response.json() as Promise<T>;
};
