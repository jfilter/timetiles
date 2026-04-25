/**
 * Unified API route handler with built-in auth, validation, and error handling.
 *
 * @module
 * @category API
 */
import type { NextRequest } from "next/server";
import { getPayload, type Payload } from "payload";
import type { z } from "zod";

import { createLogger } from "@/lib/logger";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";
import { checkRateLimit, type RateLimitOptions } from "@/lib/middleware/rate-limit";
import config from "@/payload.config";
import type { User } from "@/payload-types";

import { requireDefaultSite } from "./auth-helpers";
import { ForbiddenError, handleError, UnauthorizedError, ValidationError } from "./errors";

const logger = createLogger("api-handler");

type AuthMode = "required" | "optional" | "admin" | "none";
type AuthenticatedModes = "required" | "admin";

interface RouteContext<TBody, TQuery, TParams, TAuth extends AuthMode> {
  req: AuthenticatedRequest;
  user: TAuth extends AuthenticatedModes ? User : User | undefined;
  payload: Payload;
  body: TBody;
  query: TQuery;
  params: TParams;
}

interface RouteConfig<TBody = undefined, TQuery = undefined, TParams = undefined, TAuth extends AuthMode = "required"> {
  /** Auth mode. Default: "required" */
  auth?: TAuth;
  /** Rate limit options */
  rateLimit?: RateLimitOptions;
  /** Restrict to the default (main) site. Non-default sites receive 403. */
  site?: "default";
  /** Zod schema for request body (parsed from request.json()) */
  body?: z.ZodType<TBody>;
  /** Zod schema for query parameters (parsed from URL searchParams) */
  query?: z.ZodType<TQuery>;
  /** Zod schema for route params (e.g., { id: z.string() }) */
  params?: z.ZodType<TParams>;
  /**
   * The route handler function.
   *
   * Return a plain object to auto-serialize as JSON (HTTP 200).
   * Return a `Response` directly for non-JSON responses (streams, redirects)
   * or when a non-200 status code is needed.
   */
  handler: (
    ctx: RouteContext<TBody, TQuery, TParams, TAuth>
  ) => Promise<Response | Record<string, unknown>> | Response | Record<string, unknown>;
}

/**
 * Narrow check: is this error a genuine Payload auth rejection (as opposed to an
 * infrastructure error like a DB timeout)? Payload's auth errors extend APIError
 * with status 401 (AuthenticationError, UnauthorizedError, LockedAuth) or 403
 * (Forbidden). We also accept the string name match as a belt-and-suspenders fallback.
 */
const isAuthRejection = (error: unknown): boolean => {
  if (error == null || typeof error !== "object") return false;
  const e = error as { status?: unknown; name?: unknown };
  if (typeof e.status === "number" && (e.status === 401 || e.status === 403)) return true;
  if (typeof e.name === "string") {
    return (
      e.name === "AuthenticationError" ||
      e.name === "UnauthorizedError" ||
      e.name === "Forbidden" ||
      e.name === "LockedAuth"
    );
  }
  return false;
};

const authenticateRequest = async (
  payload: Payload,
  req: NextRequest,
  authMode: AuthMode
): Promise<AuthenticatedRequest> => {
  const authReq = req as AuthenticatedRequest;

  if (authMode === "none") {
    return authReq;
  }

  try {
    const { user } = await payload.auth({ headers: req.headers });
    authReq.user = user as User;
  } catch (error) {
    // Only swallow genuine auth rejections on optional routes. For "required"/"admin"
    // routes, always rethrow so infrastructure failures (DB timeouts, network errors)
    // surface as 500s instead of masquerading as "unauthenticated". An auth rejection
    // from Payload is an APIError subclass with status 401 or 403 (missing/invalid
    // session, locked account, etc.).
    if (authMode === "optional" && isAuthRejection(error)) {
      logger.debug("Optional auth: proceeding as anonymous", { error });
    } else {
      logger.error("Auth check failed with unexpected error", { error, authMode });
      throw error;
    }
  }

  if ((authMode === "required" || authMode === "admin") && !authReq.user) {
    throw new UnauthorizedError("Authentication required");
  }

  if (authMode === "admin" && authReq.user?.role !== "admin") {
    throw new ForbiddenError("Admin access required");
  }

  return authReq;
};

const parseRequestBody = async <TBody>(req: NextRequest, bodySchema?: z.ZodType<TBody>): Promise<TBody> => {
  if (!bodySchema) {
    return undefined as TBody;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON in request body");
  }

  return bodySchema.parse(rawBody);
};

const parseRequestQuery = <TQuery>(req: NextRequest, querySchema?: z.ZodType<TQuery>): TQuery => {
  if (!querySchema) {
    return undefined as TQuery;
  }

  const rawQuery: Record<string, string | string[]> = {};

  for (const [key, value] of new URL(req.url).searchParams.entries()) {
    const existing = rawQuery[key];
    if (existing == null) {
      rawQuery[key] = value;
      continue;
    }

    rawQuery[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }

  return querySchema.parse(rawQuery);
};

const parseRouteParams = async <TParams>(
  context: { params: Promise<Record<string, string>> },
  paramsSchema?: z.ZodType<TParams>
): Promise<TParams> => {
  const resolvedParams = await context.params;
  return paramsSchema ? paramsSchema.parse(resolvedParams) : (resolvedParams as TParams);
};

/**
 * Create a Next.js API route handler with built-in auth, validation, and error handling.
 *
 * @example
 * ```typescript
 * export const POST = apiRoute({
 *   auth: "admin",
 *   rateLimit: { type: "API_GENERAL" },
 *   body: z.object({ address: z.string().min(1) }),
 *   handler: async ({ body, payload }) => {
 *     const result = await SomeService.process(payload, body);
 *     return result; // Auto-wrapped as { success: true, ...result }
 *   },
 * });
 * ```
 */
export const apiRoute = <
  TBody = undefined,
  TQuery = undefined,
  TParams = undefined,
  TAuth extends AuthMode = "required",
>(
  routeConfig: RouteConfig<TBody, TQuery, TParams, TAuth>
) => {
  const authMode: AuthMode = routeConfig.auth ?? "required";

  const coreHandler = async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ): Promise<Response> => {
    // Track the user across the try/catch boundary so unhandled-error logs
    // can include the userId even when the failure happens after auth.
    let authedUser: User | undefined;
    try {
      const payload = await getPayload({ config });
      const authReq = await authenticateRequest(payload, req, authMode);
      authedUser = authReq.user;

      // --- Rate limiting (after auth so user-based keys work) ---
      if (routeConfig.rateLimit) {
        const rateLimitResponse = await checkRateLimit(req, authReq.user, routeConfig.rateLimit);
        if (rateLimitResponse) return rateLimitResponse;
      }

      // --- Site restriction ---
      if (routeConfig.site === "default") {
        await requireDefaultSite(payload, req);
      }

      const body = await parseRequestBody(req, routeConfig.body);
      const query = parseRequestQuery(req, routeConfig.query);
      const params = await parseRouteParams(context, routeConfig.params);

      // --- Call handler ---
      const result = await routeConfig.handler({
        req: authReq,
        user: authReq.user,
        payload,
        body,
        query,
        params,
      } as RouteContext<TBody, TQuery, TParams, TAuth>);

      // Auto-wrap plain objects as JSON; pass through Response objects (streams, redirects)
      if (result instanceof Response) {
        return result;
      }
      return Response.json(result);
    } catch (err) {
      return handleError(err, { url: req.url, method: req.method, userId: authedUser?.id });
    }
  };

  return coreHandler;
};
