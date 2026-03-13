/**
 * React Query hooks for authentication operations.
 *
 * Provides request functions and React Query mutations for authentication
 * operations, plus a query for the current user session.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { fetchJson } from "../api/http-error";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload CMS `/api/users/me` response shape. */
export interface CurrentUserResponse {
  user: { id: number; email: string; _verified?: boolean; [key: string]: unknown } | null;
}

/** Payload CMS `/api/users/login` response shape. */
interface LoginResponse {
  user?: { id: number; email: string; [key: string]: unknown };
  message?: string;
  errors?: Array<{ message: string }>;
}

/** `/api/auth/register` response shape. */
interface RegisterResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/** Input for the login mutation. */
export interface LoginInput {
  email: string;
  password: string;
}

/** Input for the register mutation. */
export interface RegisterInput {
  email: string;
  password: string;
}

/** Input for the forgot-password mutation. */
export interface ForgotPasswordInput {
  email: string;
}

/** Input for the reset-password mutation. */
export interface ResetPasswordInput {
  token: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const authKeys = { currentUser: ["auth", "current-user"] as const };

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch the current authenticated user via `/api/users/me`.
 *
 * Disabled by default -- callers opt in via `enabled`.
 */
export const useCurrentUserQuery = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: authKeys.currentUser,
    queryFn: async () => {
      const response = await fetch("/api/users/me", { credentials: "include" });
      if (!response.ok) return { user: null } satisfies CurrentUserResponse;
      return (await response.json()) as CurrentUserResponse;
    },
    enabled: options?.enabled ?? true,
    staleTime: 0,
  });
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Login via Payload CMS `/api/users/login`.
 *
 * Uses raw `fetch` instead of `fetchJson` because the component inspects the
 * response body for both success and error cases (Payload returns 4xx with a
 * JSON body containing `errors` or `message`).
 */
export const loginRequest = async (input: LoginInput): Promise<LoginResponse> => {
  const response = await fetch("/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });

  const data = (await response.json()) as LoginResponse;

  if (response.ok && data.user) {
    return data;
  }

  const message = data.errors?.[0]?.message ?? data.message ?? "Invalid email or password";
  throw new Error(message);
};

/**
 * Register a new user via `/api/auth/register`.
 *
 * Uses raw `fetch` because the response shape differs from the standard
 * `fetchJson` error-handling convention (uses `error` field, not HTTP status
 * for some validation errors).
 */
export const registerRequest = async (input: RegisterInput): Promise<RegisterResponse> => {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as RegisterResponse;

  if (!response.ok || !data.success) {
    const message = data.error ?? "Registration failed. Please try again.";
    throw new Error(message);
  }

  return data;
};

/**
 * Request a password-reset email via Payload CMS `/api/users/forgot-password`.
 *
 * Always succeeds from the caller's perspective to prevent email enumeration.
 */
export const forgotPasswordRequest = async (input: ForgotPasswordInput): Promise<void> => {
  await fetch("/api/users/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  // Always succeed regardless of response to prevent email enumeration
};

/**
 * Reset password via Payload CMS `/api/users/reset-password`.
 */
export const resetPasswordRequest = (input: ResetPasswordInput): Promise<void> =>
  fetchJson<void>("/api/users/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

/**
 * Logout via Payload CMS `/api/users/logout`.
 */
export const logoutRequest = async (): Promise<void> => {
  await fetch("/api/users/logout", { method: "POST", credentials: "include" });
};

export const useLogoutMutation = () => useMutation({ mutationFn: logoutRequest });

/**
 * Verify email via Payload CMS `/api/users/verify/:token`.
 */
export const verifyEmailRequest = (token: string): Promise<void> =>
  fetchJson<void>(`/api/users/verify/${token}`, { method: "POST", headers: { "Content-Type": "application/json" } });

export const useVerifyEmailMutation = () => useMutation({ mutationFn: verifyEmailRequest });
