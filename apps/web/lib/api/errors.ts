/**
 * Standardized error classes and centralized error handler for API routes.
 *
 * The base {@link AppError} class lives in `lib/types/errors.ts` (Layer 0)
 * so that any layer can extend it without violating architectural boundaries.
 * It is re-exported here for convenience.
 *
 * @module
 * @category API
 */
import type { Payload } from "payload";
import { z } from "zod";

import { logError } from "@/lib/logger";
import { AppError } from "@/lib/types/errors";
import type { User } from "@/payload-types";

export { AppError };

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

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, "BAD_REQUEST", details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}

/**
 * Fetch a record by ID with Payload access control.
 * Returns the record or throws NotFoundError (caught by apiRoute's handleError).
 */
export const safeFindByID = async <T>(
  payload: Payload,
  options: { collection: string; id: string | number; user?: User; depth?: number; overrideAccess?: boolean }
): Promise<T> => {
  const { collection, id, user, depth = 0, overrideAccess = false } = options;
  const record = await payload
    .findByID({ collection, id, depth, user, overrideAccess } as Parameters<Payload["findByID"]>[0])
    .catch(() => null);

  if (!record) {
    throw new NotFoundError(`${collection.replaceAll("-", " ")} not found or access denied`);
  }

  return record as T;
};

/**
 * Centralized error handler for API routes.
 * Converts known error types to structured JSON responses.
 */
export const handleError = (err: unknown): Response => {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.code) body.code = err.code;
    if (err.details) body.details = err.details;
    return Response.json(body, { status: err.statusCode });
  }

  if (err instanceof z.ZodError) {
    return Response.json(
      { error: "Validation failed", code: "VALIDATION_ERROR", details: err.issues },
      { status: 422 }
    );
  }

  logError(err, "Unhandled error in API route");
  return Response.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
};
