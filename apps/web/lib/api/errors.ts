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
import type { Config, User } from "@/payload-types";

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

type CollectionSlug = keyof Config["collections"];
type CollectionDoc<TSlug extends CollectionSlug> = Config["collections"][TSlug];

/**
 * Fetch a record by ID with Payload access control.
 * Returns the collection-derived record type or throws NotFoundError
 * (caught by apiRoute's handleError).
 */
export const safeFindByID = async <TSlug extends CollectionSlug>(
  payload: Payload,
  options: { collection: TSlug; id: string | number; user?: User; depth?: number; overrideAccess?: boolean }
): Promise<CollectionDoc<TSlug>> => {
  const { collection, id, user, depth = 0, overrideAccess = false } = options;
  const record = await payload.findByID({ collection, id, depth, user, overrideAccess }).catch(() => null);

  if (!record) {
    throw new NotFoundError(`${collection.replaceAll("-", " ")} not found or access denied`);
  }

  return record;
};

/**
 * Request context attached to unhandled-error logs so 500s are diagnosable.
 *
 * The response body intentionally stays generic (no leaked stack/details), but
 * the server log gets the route, method, and userId so we can correlate a
 * client-visible 500 with the underlying exception in production logs.
 */
export interface ErrorRequestContext {
  /** Request URL (path + query). */
  url?: string;
  /** HTTP method (GET/POST/etc). */
  method?: string;
  /** Authenticated user id, if known at the time of failure. */
  userId?: string | number;
}

const buildErrorMetadata = (req?: ErrorRequestContext): Record<string, unknown> | undefined => {
  if (!req) return undefined;
  const meta: Record<string, unknown> = {};
  if (req.url) {
    try {
      // Strip origin so logs stay compact and don't accidentally leak the host
      // when forwarded; keep the path + searchParams.
      const parsed = new URL(req.url);
      meta.path = parsed.pathname;
      if (parsed.search) meta.query = parsed.search;
    } catch {
      meta.url = req.url;
    }
  }
  if (req.method) meta.method = req.method;
  if (req.userId !== undefined) meta.userId = req.userId;
  return Object.keys(meta).length > 0 ? meta : undefined;
};

/**
 * Centralized error handler for API routes.
 * Converts known error types to structured JSON responses.
 *
 * For unhandled errors (resulting in a generic 500), the underlying error
 * (with stack) is logged server-side together with the optional request
 * context so the next failure is debuggable. The HTTP response shape is
 * deliberately kept generic to avoid leaking stack traces or implementation
 * details to clients.
 */
/**
 * Next.js control-flow "errors" thrown by `redirect()` / `notFound()`. They must
 * propagate out of the route handler so the framework can turn them into the
 * proper HTTP response instead of a 500. Detected via digest (like Next's own
 * `unstable_rethrow`) so the check works when tests mock `next/navigation`.
 */
const isNextControlFlowError = (err: unknown): boolean => {
  if (err == null || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND"
  );
};

/**
 * Payload's `APIError` (and subclasses like `AuthenticationError`, `NotFound`)
 * carry a meaningful HTTP status. Detected by shape — mirroring
 * `isAuthRejection` in handler.ts — so the check survives mocked `payload`
 * modules in unit tests.
 */
const getPayloadErrorStatus = (err: unknown): number | undefined => {
  if (!(err instanceof Error) || !("isPublic" in err)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status <= 599 ? status : undefined;
};

export const handleError = (err: unknown, req?: ErrorRequestContext): Response => {
  if (isNextControlFlowError(err)) throw err;

  if (err instanceof AppError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.code) body.code = err.code;
    // Never serialize `details` on 5xx: they routinely carry internal specifics
    // (raw DB/errno messages, absolute file paths — e.g. a failed data-export's
    // errorLog) that must not reach the client. Log them server-side instead.
    if (err.statusCode >= 500) {
      logError(err, "AppError (5xx) in API route", buildErrorMetadata(req));
    } else if (err.details) {
      body.details = err.details;
    }
    return Response.json(body, { status: err.statusCode });
  }

  if (err instanceof z.ZodError) {
    return Response.json(
      { error: "Validation failed", code: "VALIDATION_ERROR", details: err.issues },
      { status: 422 }
    );
  }

  // Surface Payload client errors (401 invalid credentials, 404 not found, ...)
  // with their message and status; keep 5xx responses generic so internals
  // don't leak.
  const payloadStatus = getPayloadErrorStatus(err);
  if (payloadStatus != null) {
    if (payloadStatus < 500) {
      return Response.json({ error: (err as Error).message }, { status: payloadStatus });
    }
    logError(err, "Unhandled Payload error in API route", buildErrorMetadata(req));
    return Response.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: payloadStatus });
  }

  logError(err, "Unhandled error in API route", buildErrorMetadata(req));
  return Response.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
};
