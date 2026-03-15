"use client";

/**
 * Shared newsletter subscription state machine.
 *
 * Handles email input, status transitions, and auto-reset with proper timer
 * cleanup. Accepts an optional `onSubmit` handler so the consuming app can
 * control how the subscription request is made. When `onSubmit` is omitted the
 * hook falls back to a built-in `fetch("/api/newsletter/subscribe")` call.
 *
 * @module
 * @category Hooks
 */
import { useEffect, useRef, useState } from "react";

type SubmitStatus = "idle" | "loading" | "success" | "error";

interface UseNewsletterSubscriptionConfig {
  resetDelay?: number;
  additionalData?: Record<string, unknown>;
  /**
   * Custom submission handler. When provided, the hook delegates to this
   * function instead of the built-in fetch. The handler receives the email
   * and optional additional data, and should throw on failure so the hook's
   * error handling can display the message.
   */
  onSubmit?: (email: string, additionalData?: Record<string, unknown>) => Promise<void>;
}

interface UseNewsletterSubscriptionReturn {
  email: string;
  setEmail: (email: string) => void;
  status: SubmitStatus;
  message: string;
  handleSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => Promise<void>;
}

export const useNewsletterSubscription = ({
  resetDelay = 5000,
  additionalData,
  onSubmit,
}: UseNewsletterSubscriptionConfig = {}): UseNewsletterSubscriptionReturn => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email) return;

    setStatus("loading");
    setMessage("");

    try {
      if (onSubmit) {
        await onSubmit(email, additionalData);
      } else {
        const response = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, ...additionalData }),
        });

        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Subscription failed. Please try again.");
        }
      }

      setStatus("success");
      setMessage("Successfully subscribed!");
      setEmail("");
    } catch (error) {
      setStatus("error");
      const errorMessage = error instanceof Error ? error.message : "Network error. Please try again.";
      setMessage(errorMessage);
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setStatus("idle");
      setMessage("");
    }, resetDelay);
  };

  return { email, setEmail, status, message, handleSubmit };
};
