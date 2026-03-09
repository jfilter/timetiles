/**
 * Hook for managing form submission state (loading, error, success).
 *
 * Eliminates the repeated pattern of useState + try/catch/finally + async IIFE
 * found across auth and settings forms.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useState } from "react";

export type FormSubmissionStatus = "idle" | "loading" | "success" | "error";

interface UseFormSubmissionReturn {
  status: FormSubmissionStatus;
  error: string | null;
  isLoading: boolean;
  submit: (action: () => Promise<void>) => void;
  reset: () => void;
}

/**
 * Manages the loading/error/success lifecycle of a form submission.
 *
 * The caller provides an async action that performs the fetch and throws on error.
 * The hook handles setting loading state, catching errors, and tracking success.
 *
 * @example
 * ```tsx
 * const { status, error, isLoading, submit } = useFormSubmission();
 *
 * const handleSubmit = (e: React.FormEvent) => {
 *   e.preventDefault();
 *   submit(async () => {
 *     const res = await fetch("/api/endpoint", { method: "POST", body: ... });
 *     if (!res.ok) throw new Error("Something went wrong");
 *   });
 * };
 * ```
 */
export const useFormSubmission = (): UseFormSubmissionReturn => {
  const [status, setStatus] = useState<FormSubmissionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback((action: () => Promise<void>) => {
    setStatus("loading");
    setError(null);

    void (async () => {
      try {
        await action();
        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        setStatus("error");
      }
    })();
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    error,
    isLoading: status === "loading",
    submit,
    reset,
  };
};
