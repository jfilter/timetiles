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
export function apiError(
  message: string,
  status: number,
  code?: string,
  details?: unknown
): NextResponse<ErrorResponse> {
  const response: ErrorResponse = { error: message };
  if (code) response.code = code;
  if (details) response.details = details;
  return NextResponse.json(response, { status });
}

/**
 * Create a 400 Bad Request error response.
 *
 * @param message - Error message describing what was invalid
 * @param code - Optional error code
 * @returns NextResponse with 400 status
 */
export function badRequest(message: string, code?: string): NextResponse<ErrorResponse> {
  return apiError(message, 400, code || "BAD_REQUEST");
}

/**
 * Create a 401 Unauthorized error response.
 *
 * @param message - Error message describing the authorization failure
 * @param code - Optional error code
 * @returns NextResponse with 401 status
 */
export function unauthorized(message: string = "Unauthorized", code?: string): NextResponse<ErrorResponse> {
  return apiError(message, 401, code || "UNAUTHORIZED");
}

/**
 * Create a 404 Not Found error response.
 *
 * @param message - Error message describing what was not found
 * @param code - Optional error code
 * @returns NextResponse with 404 status
 */
export function notFound(message: string = "Resource not found", code?: string): NextResponse<ErrorResponse> {
  return apiError(message, 404, code || "NOT_FOUND");
}

/**
 * Create a 405 Method Not Allowed error response.
 *
 * @param message - Error message describing allowed methods
 * @param code - Optional error code
 * @returns NextResponse with 405 status
 */
export function methodNotAllowed(message: string, code?: string): NextResponse<ErrorResponse> {
  return apiError(message, 405, code || "METHOD_NOT_ALLOWED");
}

/**
 * Create a 500 Internal Server Error response.
 *
 * @param message - Error message (should be generic, not expose internal details)
 * @param code - Optional error code
 * @param details - Optional error details (use cautiously, may expose internals)
 * @returns NextResponse with 500 status
 */
export function internalError(
  message: string = "Internal server error",
  code?: string,
  details?: unknown
): NextResponse<ErrorResponse> {
  return apiError(message, 500, code || "INTERNAL_ERROR", details);
}
