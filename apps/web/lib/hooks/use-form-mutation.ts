/**
 * Combined form mutation hook that merges React Query mutation with
 * form-specific status tracking.
 *
 * Wraps React Query `useMutation` with form-specific status tracking
 * to eliminate manual loading/error/success state management.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation } from "@tanstack/react-query";

export type FormStatus = "idle" | "loading" | "success" | "error";

interface UseFormMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}

interface UseFormMutationReturn<TData, TVariables> {
  status: FormStatus;
  error: string | null;
  isLoading: boolean;
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
}

export const useFormMutation = <TData = void, TVariables = void>(
  options: UseFormMutationOptions<TData, TVariables>
): UseFormMutationReturn<TData, TVariables> => {
  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn: options.mutationFn,
    onSuccess: options.onSuccess,
    onError: options.onError,
  });

  const status: FormStatus = mutation.status === "pending" ? "loading" : mutation.status;
  const error: string | null = mutation.error ? mutation.error.message || "An unexpected error occurred" : null;

  const reset = () => {
    mutation.reset();
  };

  return {
    status,
    error,
    isLoading: status === "loading",
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    reset,
  };
};
