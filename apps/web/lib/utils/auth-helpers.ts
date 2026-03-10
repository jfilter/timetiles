/**
 * Shared authentication helper functions for account API routes.
 *
 * @module
 * @category Utils
 */
import type { Payload } from "payload";

import { logger } from "@/lib/logger";
import type { User } from "@/payload-types";

/**
 * Verify a user's password by attempting a login.
 * Throws an error with a descriptive message on failure.
 */
export const verifyPassword = async (payload: Payload, user: User, password: string): Promise<void> => {
  try {
    await payload.login({
      collection: "users",
      data: {
        email: user.email,
        password,
      },
    });
  } catch {
    logger.warn({ userId: user.id }, "Failed password verification");
    throw new Error("Password is incorrect");
  }
};
