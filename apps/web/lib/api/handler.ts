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
    try {
      const payload = await getPayload({ config });

      // --- Auth ---
      const authReq = req as AuthenticatedRequest;
      if (authMode !== "none") {
        try {
          const { user } = await payload.auth({ headers: req.headers });
          authReq.user = user as User;
        } catch (error) {
          logger.debug("Auth check failed", { error });
        }

        if ((authMode === "required" || authMode === "admin") && !authReq.user) {
          throw new UnauthorizedError("Authentication required");
        }

        if (authMode === "admin" && authReq.user?.role !== "admin") {
          throw new ForbiddenError("Admin access required");
        }
      }

      // --- Rate limiting (after auth so user-based keys work) ---
      if (routeConfig.rateLimit) {
        const rateLimitResponse = await checkRateLimit(req, authReq.user, routeConfig.rateLimit);
        if (rateLimitResponse) return rateLimitResponse;
      }

      // --- Site restriction ---
      if (routeConfig.site === "default") {
        await requireDefaultSite(payload, req);
      }

      // --- Validate body ---
      let body: TBody = undefined as TBody;
      if (routeConfig.body) {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          throw new ValidationError("Invalid JSON in request body");
        }
        body = routeConfig.body.parse(rawBody);
      }

      // --- Validate query ---
      const query = routeConfig.query
        ? routeConfig.query.parse(Object.fromEntries(new URL(req.url).searchParams))
        : (undefined as TQuery);

      // --- Validate params ---
      const resolvedParams = await context.params;
      const params = routeConfig.params ? routeConfig.params.parse(resolvedParams) : (resolvedParams as TParams);

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
      return handleError(err);
    }
  };

  return coreHandler;
};
