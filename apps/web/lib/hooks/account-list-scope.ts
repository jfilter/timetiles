/**
 * Owner scope of the personal account lists (imports, schedules, scrapers).
 *
 * @module
 * @category Hooks
 */
"use client";

import { useAuthState } from "./use-auth-queries";

/** Server-rendered rows of a personal list and the user the server loaded them for. */
export interface AccountListInitial<T> {
  ownerId: number;
  data: T[];
}

/**
 * Resolve the user a personal list is scoped to.
 *
 * The server-rendered owner scopes the list while the current-user query is still loading,
 * so prefetched rows render on the first paint; once it resolves, only its user counts.
 */
export const useAccountListScope = <T>(initial?: AccountListInitial<T>) => {
  const { userId: currentUserId, isLoading } = useAuthState();
  const userId = isLoading ? (initial?.ownerId ?? null) : currentUserId;
  const initialData = initial?.ownerId === userId ? initial.data : undefined;
  return { userId, initialData };
};
