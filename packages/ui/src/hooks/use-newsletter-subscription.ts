"use client";

/**
 * Shared newsletter subscription state machine.
 *
 * Handles email input, POST to /api/newsletter/subscribe, status transitions,
 * and auto-reset with proper timer cleanup.
 *
 * @module
 * @category Hooks
 */
import { useCallback, useEffect, useRef, useState } from "react";

type SubmitStatus = "idle" | "loading" | "success" | "error";

interface UseNewsletterSubscriptionConfig {
  resetDelay?: number;
  additionalData?: Record<string, unknown>;
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

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!email) return;

      setStatus("loading");
      setMessage("");

      try {
        const response = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, ...additionalData }),
        });

        const data = (await response.json()) as { error?: string };

        if (response.ok) {
          setStatus("success");
          setMessage("Successfully subscribed!");
          setEmail("");
        } else {
          setStatus("error");
          setMessage(data.error ?? "Subscription failed. Please try again.");
        }
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
    },
    [email, additionalData, resetDelay]
  );

  return { email, setEmail, status, message, handleSubmit };
};
