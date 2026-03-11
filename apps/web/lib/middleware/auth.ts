/**
 * Authentication types for API routes.
 *
 * @module
 */
import type { NextRequest } from "next/server";

import type { User } from "@/payload-types";

export interface AuthenticatedRequest extends NextRequest {
  user?: User;
}
