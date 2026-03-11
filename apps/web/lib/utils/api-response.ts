/**
 * Provides standardized API response utilities for consistent error handling.
 *
 * This module defines a standard error response format used across all API routes,
 * ensuring consistent error handling and making it easier for clients to parse
 * and handle errors uniformly.
 *
 * @module
 * @category Utils
 */
import { NextResponse } from "next/server";

/**
 * Standard error response format for all API routes.
 */
export interface ErrorResponse {
  /** Human-readable error message */
  error: string;
  /** Optional error code for programmatic handling (e.g., "INVALID_BOUNDS", "UNAUTHORIZED") */
  code?: string;
  /** Optional additional error context or details */
  details?: unknown;
}

/**
 * Create a standardized error response.
 *
 * @param message - Human-readable error message
 * @param status - HTTP status code
 * @param code - Optional error code for programmatic handling
 * @param details - Optional additional error context
 * @returns NextResponse with standardized error format
 */
export const apiError = (
  message: string,
  status: number,
  code?: string,
  details?: unknown
): NextResponse<ErrorResponse> => {
  const response: ErrorResponse = { error: message };
  if (code) response.code = code;
  if (details) response.details = details;
  return NextResponse.json(response, { status });
};

/**
 * Create a 400 Bad Request error response.
 *
 * @param message - Error message describing what was invalid
 * @param code - Optional error code
 * @returns NextResponse with 400 status
 */
export const badRequest = (message: string, code?: string): NextResponse<ErrorResponse> =>
  apiError(message, 400, code ?? "BAD_REQUEST");

/**
 * Create a 401 Unauthorized error response.
 *
 * @param message - Error message describing the authorization failure
 * @param code - Optional error code
 * @returns NextResponse with 401 status
 */
export const unauthorized = (message: string = "Unauthorized", code?: string): NextResponse<ErrorResponse> =>
  apiError(message, 401, code ?? "UNAUTHORIZED");

/**
 * Create a 403 Forbidden error response.
 *
 * @param message - Error message describing the authorization failure
 * @param code - Optional error code
 * @returns NextResponse with 403 status
 */
export const forbidden = (message: string = "Forbidden", code?: string): NextResponse<ErrorResponse> =>
  apiError(message, 403, code ?? "FORBIDDEN");

/**
 * Create a 404 Not Found error response.
 *
 * @param message - Error message describing what was not found
 * @param code - Optional error code
 * @returns NextResponse with 404 status
 */
export const notFound = (message: string = "Resource not found", code?: string): NextResponse<ErrorResponse> =>
  apiError(message, 404, code ?? "NOT_FOUND");

/**
 * Create a 405 Method Not Allowed error response.
 *
 * @param message - Error message describing allowed methods
 * @param code - Optional error code
 * @returns NextResponse with 405 status
 */
export const methodNotAllowed = (message: string, code?: string): NextResponse<ErrorResponse> =>
  apiError(message, 405, code ?? "METHOD_NOT_ALLOWED");

/**
 * Create a 409 Conflict error response.
 *
 * @param message - Error message describing the conflict
 * @param code - Optional error code
 * @param details - Optional conflict context (e.g., existing resource ID)
 * @returns NextResponse with 409 status
 */
export const conflict = (message: string, code?: string, details?: unknown): NextResponse<ErrorResponse> =>
  apiError(message, 409, code ?? "CONFLICT", details);

/**
 * Create a 429 Rate Limited error response.
 *
 * @param message - Error message describing the rate limit
 * @param code - Optional error code
 * @returns NextResponse with 429 status
 */
export const rateLimited = (message: string = "Too many requests", code?: string): NextResponse<ErrorResponse> =>
  apiError(message, 429, code ?? "RATE_LIMITED");

/**
 * Create a 410 Gone error response.
 *
 * @param message - Error message describing the expired resource
 * @param code - Optional error code
 * @returns NextResponse with 410 status
 */
export const gone = (message: string, code?: string): NextResponse<ErrorResponse> =>
  apiError(message, 410, code ?? "GONE");

/**
 * Create a 500 Internal Server Error response.
 *
 * @param message - Error message (should be generic, not expose internal details)
 * @param code - Optional error code
 * @param details - Optional error details (use cautiously, may expose internals)
 * @returns NextResponse with 500 status
 */
export const internalError = (
  message: string = "Internal server error",
  code?: string,
  details?: unknown
): NextResponse<ErrorResponse> => apiError(message, 500, code ?? "INTERNAL_ERROR", details);

/**
 * Create an error handler function for API routes.
 *
 * This factory function creates a consistent error handler that logs errors
 * and returns a standardized 500 response. Use this to eliminate duplicate
 * error handling logic across API routes.
 *
 * @param context - Verb phrase describing the failed action (e.g., "fetch map clusters")
 * @param logger - Logger instance with error method
 * @returns Error handler function
 *
 * @example
 * ```typescript
 * const handleError = createErrorHandler("fetch events", logger);
 * // In catch block:
 * return handleError(error);
 * ```
 */
export const createErrorHandler =
  (context: string, logger: { error: (message: string, meta?: unknown) => void }) =>
  (error: unknown): NextResponse<ErrorResponse> => {
    logger.error(`Error ${context}:`, {
      error: error as Error,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    return NextResponse.json({ error: `Failed to ${context}` }, { status: 500 });
  };
