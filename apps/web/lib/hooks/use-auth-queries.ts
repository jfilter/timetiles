/**
 * React Query hooks for authentication state.
 *
 * Provides the current user query and derived auth state booleans.
 * Separated from mutation hooks to enforce clear module boundaries.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { User } from "@/payload-types";

import { fetchJson, HttpError } from "../api/http-error";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload CMS `/api/users/me` response shape. */
export interface CurrentUserResponse {
  user: User | null;
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
    queryFn: async (): Promise<CurrentUserResponse> => {
      try {
        return await fetchJson<CurrentUserResponse>("/api/users/me", { credentials: "include" });
      } catch (error) {
        // Expected auth failures (not logged in, insufficient permissions) → treat as no user
        if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
          return { user: null };
        }
        // Network errors, 500s, etc. should surface via React Query's error state
        throw error;
      }
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
