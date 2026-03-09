/**
 * Authentication middleware for API routes.
 *
 * Provides authentication and authorization middleware functions that integrate
 * with Payload CMS authentication system.
 *
 * @module
 */
import config from "@payload-config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import type { User } from "@/payload-types";

export interface AuthenticatedRequest extends NextRequest {
  user?: User;
}

type RouteHandler<TContext> = (req: AuthenticatedRequest, context: TContext) => Promise<Response> | Response;

const UNAUTHORIZED = { error: "Authentication required" } as const;

/**
 * Authenticate a request and attach the user to it.
 * Returns the authenticated request, or null if authentication failed/absent.
 */
const authenticateRequest = async (request: NextRequest): Promise<AuthenticatedRequest> => {
  const payload = await getPayload({ config });
  const authRequest = request as AuthenticatedRequest;

  try {
    const { user } = await payload.auth({ headers: request.headers });
    authRequest.user = user as User;
  } catch {
    // Authentication failed — user remains undefined
  }

  return authRequest;
};

/**
 * Middleware that requires authentication.
 * Returns 401 if user is not authenticated.
 */
export const withAuth =
  <TContext = unknown>(handler: RouteHandler<TContext>) =>
  async (request: NextRequest, context: TContext) => {
    const authRequest = await authenticateRequest(request);

    if (!authRequest.user) {
      logError(null, "Authentication failed in withAuth middleware");
      return NextResponse.json(UNAUTHORIZED, { status: 401 });
    }

    return handler(authRequest, context);
  };

/**
 * Middleware that allows optional authentication.
 * Does not return an error if user is not authenticated.
 */
export const withOptionalAuth =
  <TContext = unknown>(handler: RouteHandler<TContext>) =>
  async (request: NextRequest, context: TContext) => {
    const authRequest = await authenticateRequest(request);
    return handler(authRequest, context);
  };

/**
 * Middleware that requires admin authentication.
 * Returns 401 if user is not authenticated and 403 if user is not an admin.
 */
export const withAdminAuth =
  <TContext = unknown>(handler: RouteHandler<TContext>) =>
  async (request: NextRequest, context: TContext) => {
    const authRequest = await authenticateRequest(request);

    if (!authRequest.user) {
      logError(null, "Authentication failed in withAdminAuth middleware");
      return NextResponse.json(UNAUTHORIZED, { status: 401 });
    }

    if (authRequest.user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    return handler(authRequest, context);
  };
