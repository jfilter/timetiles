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
import { useCallback, useEffect, useState } from "react";

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
  const [formStatus, setFormStatus] = useState<FormStatus>("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn: options.mutationFn,
    onSuccess: (data, variables) => {
      setFormStatus("success");
      options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      setFormError(error.message || "An unexpected error occurred");
      setFormStatus("error");
      options.onError?.(error, variables);
    },
  });

  // Sync loading state from mutation
  useEffect(() => {
    if (mutation.isPending) {
      setFormStatus("loading");
      setFormError(null);
    }
  }, [mutation.isPending]);

  const { reset: mutationReset } = mutation;
  const reset = useCallback(() => {
    setFormStatus("idle");
    setFormError(null);
    mutationReset();
  }, [mutationReset]);

  return {
    status: formStatus,
    error: formError,
    isLoading: formStatus === "loading",
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    reset,
  };
};
