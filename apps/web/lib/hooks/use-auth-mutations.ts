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

import { HttpError, fetchJson } from "../api/http-error";

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

/**
 * Derive auth booleans from the current user query.
 *
 * Single source of truth for client-side auth state. Components should
 * use this instead of maintaining their own auth state copies.
 */
export const useAuthState = () => {
  const { data, isLoading } = useCurrentUserQuery();
  const user = data?.user ?? null;

  return {
    isAuthenticated: user != null,
    isEmailVerified: user?._verified === true,
    userId: user?.id ?? null,
    isLoading,
    user,
  };
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Login via Payload CMS `/api/users/login`. */
export const loginRequest = async (input: LoginInput): Promise<LoginResponse> => {
  try {
    return await fetchJson<LoginResponse>("/api/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "include",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      const body = error.body as LoginResponse | undefined;
      throw new Error(body?.errors?.[0]?.message ?? body?.message ?? "Invalid email or password");
    }
    throw error;
  }
};

/** Register a new user via `/api/auth/register`. */
export const registerRequest = async (input: RegisterInput): Promise<RegisterResponse> => {
  try {
    return await fetchJson<RegisterResponse>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      const body = error.body as RegisterResponse | undefined;
      throw new Error(body?.error ?? "Registration failed. Please try again.");
    }
    throw error;
  }
};

/**
 * Request a password-reset email via Payload CMS `/api/users/forgot-password`.
 *
 * Always succeeds from the caller's perspective to prevent email enumeration.
 */
export const forgotPasswordRequest = async (input: ForgotPasswordInput): Promise<void> => {
  try {
    await fetchJson<void>("/api/users/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    // Intentionally swallow — prevent email enumeration
  }
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
