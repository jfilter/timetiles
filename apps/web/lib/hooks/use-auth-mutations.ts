/**
 * React Query mutation hooks for authentication operations.
 *
 * Provides request functions and React Query mutations for login, register,
 * password reset, and logout. Auth queries live in `use-auth-queries.ts`.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation } from "@tanstack/react-query";

import type { User } from "@/payload-types";

import { fetchJson, postJson } from "../api/http-error";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** `/api/auth/login` response shape (mirrors Payload's login response). */
interface LoginResponse {
  user?: User;
  token?: string;
  exp?: number;
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
// Mutations
// ---------------------------------------------------------------------------

/**
 * Login via `/api/auth/login`.
 *
 * Wraps `payload.login` so the server can emit a LOGIN_FAILED audit event on
 * authentication failure — Payload's `afterError` hook only fires on the
 * native Local API bypass path, so a wrapper route is the cleanest way to
 * cover REST traffic. On success, the `afterLogin` hook handles the
 * LOGIN_SUCCESS audit.
 */
export const loginRequest = (input: LoginInput): Promise<LoginResponse> =>
  postJson<LoginResponse>("/api/auth/login", input);

/** Register a new user via `/api/auth/register`. */
export const registerRequest = (input: RegisterInput): Promise<RegisterResponse> =>
  fetchJson<RegisterResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

/**
 * Request a password-reset email via `/api/auth/forgot-password`.
 *
 * Anti-enumeration lives SERVER-side (the route returns identical success for
 * existing and unknown emails, with a timing pad) — so transport failures
 * (429 rate limit, validation, 5xx) must propagate. Swallowing them showed a
 * false "email sent" success for a request that never went through.
 */
export const forgotPasswordRequest = async (input: ForgotPasswordInput): Promise<void> => {
  await fetchJson<void>("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
};

/**
 * Reset password via TimeTiles' `/api/users/reset-password` override,
 * which enforces password policy and revokes all sessions.
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
  await fetchJson<void>("/api/users/logout", { method: "POST", credentials: "include" });
};

export const useLogoutMutation = () => useMutation({ mutationFn: logoutRequest });

/**
 * Verify email via Payload CMS `/api/users/verify/:token`.
 */
export const verifyEmailRequest = (token: string): Promise<void> =>
  fetchJson<void>(`/api/users/verify/${token}`, { method: "POST", headers: { "Content-Type": "application/json" } });

export const useVerifyEmailMutation = () => useMutation({ mutationFn: verifyEmailRequest });
