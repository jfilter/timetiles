/**
 * Standardized error classes and centralized error handler for API routes.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { logError } from "@/lib/logger";

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
