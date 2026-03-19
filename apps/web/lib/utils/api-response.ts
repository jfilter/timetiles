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
 * @returns Response with standardized error format
 */
export const apiError = (message: string, status: number, code?: string, details?: unknown): Response => {
  const response: ErrorResponse = { error: message };
  if (code) response.code = code;
  if (details) response.details = details;
  return Response.json(response, { status });
};

/**
 * Create a 405 Method Not Allowed error response.
 *
 * Used for standalone exports outside apiRoute handlers (e.g., `export const GET = () => methodNotAllowed(...)`).
 */
export const methodNotAllowed = (message: string, code?: string): Response =>
  apiError(message, 405, code ?? "METHOD_NOT_ALLOWED");

/**
 * Create a success JSON response with a non-200 status code (e.g., 202 Accepted).
 *
 * For standard 200 responses, return a plain object from apiRoute handlers instead.
 */
export const apiSuccess = (data: Record<string, unknown>, status = 200): Response => Response.json(data, { status });
