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

/**
 * Middleware that requires authentication.
 * Returns 401 if user is not authenticated.
 */
export const withAuth =
  <TContext = unknown>(handler: (req: AuthenticatedRequest, context: TContext) => Promise<Response> | Response) =>
  async (request: NextRequest, context: TContext) => {
    const payload = await getPayload({ config });

    try {
      const { user } = await payload.auth({ headers: request.headers });

      if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }

      // Attach user to request
      const authRequest = request as AuthenticatedRequest;
      authRequest.user = user as User;

      return await handler(authRequest, context);
    } catch (error) {
      logError(error, "Authentication failed in withAuth middleware");
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  };

/**
 * Middleware that allows optional authentication.
 * Does not return an error if user is not authenticated.
 */
export const withOptionalAuth =
  <TContext = unknown>(handler: (req: AuthenticatedRequest, context: TContext) => Promise<Response> | Response) =>
  async (request: NextRequest, context: TContext) => {
    const payload = await getPayload({ config });

    try {
      const { user } = await payload.auth({ headers: request.headers });
      const authRequest = request as AuthenticatedRequest;
      authRequest.user = user as User;
    } catch {
      // Allow unauthenticated access - no user attached
    }

    return handler(request as AuthenticatedRequest, context);
  };

/**
 * Middleware that requires admin authentication.
 * Returns 401 if user is not authenticated and 403 if user is not an admin.
 */
export const withAdminAuth =
  <TContext = unknown>(handler: (req: AuthenticatedRequest, context: TContext) => Promise<Response> | Response) =>
  async (request: NextRequest, context: TContext) => {
    const payload = await getPayload({ config });

    try {
      const { user } = await payload.auth({ headers: request.headers });

      if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }

      if (user.role !== "admin") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }

      // Attach user to request
      const authRequest = request as AuthenticatedRequest;
      authRequest.user = user as User;

      return await handler(authRequest, context);
    } catch (error) {
      logError(error, "Authentication failed in withAdminAuth middleware");
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  };
