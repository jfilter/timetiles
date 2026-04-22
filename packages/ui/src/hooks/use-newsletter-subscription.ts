"use client";

/**
 * Shared newsletter subscription state machine.
 *
 * Handles email input, status transitions, and auto-reset with proper timer
 * cleanup. Requires an `onSubmit` handler (directly or via UIProvider) so
 * the consuming app controls the API call and message strings.
 *
 * @module
 * @category Hooks
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useUIConfig } from "../provider";

export type NewsletterStatus = "idle" | "loading" | "success" | "error";

/** Message strings displayed after submission. Caller must supply these so the
 *  UI package stays locale-agnostic. */
export interface NewsletterMessages {
  success: string;
  error: string;
  networkError: string;
}

interface UseNewsletterSubscriptionConfig {
  resetDelay?: number;
  additionalData?: Record<string, unknown>;
  /** Message strings shown after submission (required — keeps UI package locale-agnostic). */
  messages: NewsletterMessages;
  /**
   * Custom submission handler. When provided, the hook delegates to this
   * function instead of the UIProvider's `onNewsletterSubmit`. The handler
   * receives the email and optional additional data, and should throw on
   * failure so the hook's error handling can display the message.
   */
  onSubmit?: (email: string, additionalData?: Record<string, unknown>) => Promise<void>;
}

interface UseNewsletterSubscriptionReturn {
  email: string;
  setEmail: (email: string) => void;
  status: NewsletterStatus;
  message: string;
  handleSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export const useNewsletterSubscription = ({
  resetDelay = 5000,
  additionalData,
  messages,
  onSubmit,
}: UseNewsletterSubscriptionConfig): UseNewsletterSubscriptionReturn => {
  const { onNewsletterSubmit } = useUIConfig();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<NewsletterStatus>("idle");
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const scheduleReset = useCallback(
    (delay: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, delay);
    },
    [setStatus, setMessage]
  );

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>): void => {
      e.preventDefault();
      if (!email) return;

      setStatus("loading");
      setMessage("");

      const submit = onSubmit ?? onNewsletterSubmit;
      if (!submit) {
        setStatus("error");
        setMessage(messages.error);
        scheduleReset(resetDelay);
        return;
      }

      void (async () => {
        try {
          await submit(email, additionalData);
          setStatus("success");
          setMessage(messages.success);
          setEmail("");
        } catch (error: unknown) {
          setStatus("error");
          const errorMessage = error instanceof Error ? error.message : messages.networkError;
          setMessage(errorMessage);
        } finally {
          scheduleReset(resetDelay);
        }
      })();
    },
    [email, onSubmit, onNewsletterSubmit, additionalData, messages, resetDelay, scheduleReset]
  );

  return { email, setEmail, status, message, handleSubmit };
};
