/**
 * Error handling utilities for sanitizing error messages.
 *
 * Provides functions to log detailed errors internally while returning
 * generic, safe error messages to users in production. This prevents
 * leaking sensitive implementation details, stack traces, or system
 * information that could aid attackers.
 *
 * @module
 * @category Utils
 */

import type { User } from "payload";

import { logError as logErrorToLogger, logger } from "@/lib/logger";

/**
 * Sanitize error for external display.
 *
 * Logs full error details internally for debugging while returning
 * a generic message to users in production environments.
 *
 * @param error - The error to sanitize
 * @param context - Optional context about where the error occurred
 * @param user - Optional user who encountered the error
 * @returns Generic error message safe for external display
 */
export const sanitizeError = (error: Error | unknown, context?: string, user?: User | null): string => {
  // Extract error message
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log full error internally with context
  logger.error("Request failed", {
    error: errorMessage,
    stack: errorStack,
    context,
    userId: user?.id,
    userRole: user?.role,
    timestamp: new Date().toISOString(),
  });

  // Return generic message in production to prevent information leakage
  if (process.env.NODE_ENV === "production") {
    return "An error occurred processing your request. Please try again later.";
  }

  // In development, show actual error for debugging
  return errorMessage;
};

/**
 * Sanitize error for API response.
 *
 * Similar to sanitizeError but returns an object suitable for JSON responses.
 *
 * @param error - The error to sanitize
 * @param context - Optional context about where the error occurred
 * @param user - Optional user who encountered the error
 * @returns Error object safe for API responses
 */
export const sanitizeErrorForAPI = (
  error: Error | unknown,
  context?: string,
  user?: User | null
): {
  error: string;
  code?: string;
} => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log full error internally
  logErrorToLogger(
    error instanceof Error ? error : new Error(String(error)),
    `API Error${context ? `: ${context}` : ""}`,
    {
      userId: user?.id,
      userRole: user?.role,
      stack: errorStack,
    }
  );

  // Return generic message in production
  if (process.env.NODE_ENV === "production") {
    return {
      error: "An error occurred processing your request",
      code: "INTERNAL_ERROR",
    };
  }

  // In development, return actual error
  return {
    error: errorMessage,
    code: "INTERNAL_ERROR",
  };
};

/**
 * Check if an error is a known user-facing error that's safe to expose.
 *
 * Some errors (like validation errors, authentication errors) are meant
 * to be shown to users and don't leak sensitive information.
 *
 * @param error - The error to check
 * @returns True if the error is safe to show to users
 */
export const isSafeUserError = (error: Error | unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const safeErrorPatterns = [
    /validation/i,
    /not found/i,
    /unauthorized/i,
    /forbidden/i,
    /invalid/i,
    /duplicate/i,
    /quota exceeded/i,
    /already exists/i,
  ];

  return safeErrorPatterns.some((pattern) => pattern.test(error.message));
};

/**
 * Get user-facing error message.
 *
 * Returns the actual error message if it's a known safe error,
 * otherwise returns a generic message.
 *
 * @param error - The error to process
 * @param context - Optional context about where the error occurred
 * @param user - Optional user who encountered the error
 * @returns User-facing error message
 */
export const getUserFacingError = (error: Error | unknown, context?: string, user?: User | null): string => {
  // Log the error internally regardless
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error("Error occurred", {
    error: errorMessage,
    stack: errorStack,
    context,
    userId: user?.id,
    userRole: user?.role,
  });

  // If it's a safe error, return the actual message
  if (isSafeUserError(error)) {
    return errorMessage;
  }

  // Otherwise return generic message
  if (process.env.NODE_ENV === "production") {
    return "An error occurred processing your request";
  }

  return errorMessage;
};
