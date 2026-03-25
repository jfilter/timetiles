/**
 * Base error classes for structured error handling across all layers.
 *
 * These classes live in Layer 0 (types) so that any layer can extend them
 * without violating architectural boundaries.
 *
 * @module
 * @category Types
 */

/**
 * Base error class for application errors with HTTP status codes.
 *
 * Extend this for domain-specific errors that should map to HTTP responses.
 * The {@link handleError} function in `lib/api/errors.ts` catches these and
 * returns structured JSON responses.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}
