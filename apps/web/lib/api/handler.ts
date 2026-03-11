/**
 * Unified API route handler with built-in auth, validation, and error handling.
 *
 * @module
 * @category API
 */
import type { NextRequest } from "next/server";
import { getPayload, type Payload } from "payload";
import type { z } from "zod";

import type { AuthenticatedRequest } from "@/lib/middleware/auth";
import { checkRateLimit, type RateLimitOptions } from "@/lib/middleware/rate-limit";
import config from "@/payload.config";
import type { User } from "@/payload-types";

import { handleError } from "./errors";

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
  /** Zod schema for request body (parsed from request.json()) */
  body?: z.ZodType<TBody>;
  /** Zod schema for query parameters (parsed from URL searchParams) */
  query?: z.ZodType<TQuery>;
  /** Zod schema for route params (e.g., { id: z.string() }) */
  params?: z.ZodType<TParams>;
  /** The route handler function */
  handler: (ctx: RouteContext<TBody, TQuery, TParams, TAuth>) => Promise<Response> | Response;
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
 *     return Response.json(result);
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
        } catch {
          // auth failed - user remains undefined
        }

        if ((authMode === "required" || authMode === "admin") && !authReq.user) {
          return Response.json({ error: "Authentication required" }, { status: 401 });
        }

        if (authMode === "admin" && authReq.user?.role !== "admin") {
          return Response.json({ error: "Admin access required" }, { status: 403 });
        }
      }

      // --- Rate limiting (after auth so user-based keys work) ---
      if (routeConfig.rateLimit) {
        const rateLimitResponse = await checkRateLimit(req, authReq.user, routeConfig.rateLimit);
        if (rateLimitResponse) return rateLimitResponse;
      }

      // --- Validate body ---
      const body = routeConfig.body ? routeConfig.body.parse(await req.json().catch(() => ({}))) : (undefined as TBody);

      // --- Validate query ---
      const query = routeConfig.query
        ? routeConfig.query.parse(Object.fromEntries(new URL(req.url).searchParams))
        : (undefined as TQuery);

      // --- Validate params ---
      const resolvedParams = await context.params;
      const params = routeConfig.params ? routeConfig.params.parse(resolvedParams) : (resolvedParams as TParams);

      // --- Call handler ---
      return await routeConfig.handler({
        req: authReq,
        user: authReq.user,
        payload,
        body,
        query,
        params,
      } as RouteContext<TBody, TQuery, TParams, TAuth>);
    } catch (err) {
      return handleError(err);
    }
  };

  return coreHandler;
};
