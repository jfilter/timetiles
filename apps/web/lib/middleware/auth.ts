import config from "@payload-config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    email: string;
    role: string;
    trustLevel?: number;
  };
}

/**
 * Middleware that requires authentication.
 * Returns 401 if user is not authenticated.
 */
export const withAuth =
  (handler: (req: AuthenticatedRequest, context?: any) => Promise<Response> | Response) =>
  async (request: NextRequest, context?: any) => {
    const payload = await getPayload({ config });

    try {
      const { user } = await payload.auth({ headers: request.headers });

      if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }

      // Attach user to request
      const authRequest = request as AuthenticatedRequest;
      authRequest.user = user as any;

      return await handler(authRequest, context);
    } catch (error) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  };

/**
 * Middleware that allows optional authentication.
 * Does not return an error if user is not authenticated.
 */
export const withOptionalAuth =
  (handler: (req: AuthenticatedRequest, context?: any) => Promise<Response> | Response) =>
  async (request: NextRequest, context?: any) => {
    const payload = await getPayload({ config });

    try {
      const { user } = await payload.auth({ headers: request.headers });
      const authRequest = request as AuthenticatedRequest;
      authRequest.user = user as any;
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
  (handler: (req: AuthenticatedRequest, context?: any) => Promise<Response> | Response) =>
  async (request: NextRequest, context?: any) => {
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
      authRequest.user = user as any;

      return await handler(authRequest, context);
    } catch (error) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  };
