/**
 * Forgot password form component for requesting a password reset email.
 *
 * Uses Payload CMS built-in forgot-password endpoint. Always shows success
 * message regardless of whether the email exists to prevent user enumeration.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useCallback, useState } from "react";

export interface ForgotPasswordFormProps {
  /** Callback fired on successful submission */
  onSuccess?: () => void;
  /** Additional CSS classes */
  className?: string;
}

type FormStatus = "idle" | "loading" | "success" | "error";

export const ForgotPasswordForm = ({ onSuccess, className }: Readonly<ForgotPasswordFormProps>) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!email) return;

      setStatus("loading");
      setErrorMessage("");

      void (async () => {
        try {
          await fetch("/api/users/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });

          // Always show success regardless of response to prevent email enumeration
          setStatus("success");
          onSuccess?.();
        } catch {
          setStatus("error");
          setErrorMessage("Network error. Please try again.");
        }
      })();
    },
    [email, onSuccess]
  );

  if (status === "success") {
    return (
      <div className={cn("space-y-4 text-center", className)}>
        <div className="bg-primary/10 border-primary/20 rounded-sm border p-6">
          <svg className="text-primary mx-auto mb-4 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <h3 className="text-lg font-semibold">Check your email</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link. Please check your
            inbox.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder="you@example.com"
          disabled={status === "loading"}
          required
          autoComplete="email"
        />
      </div>

      {errorMessage && (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={status === "loading"}>
        {status === "loading" ? "Sending..." : "Send Reset Link"}
      </Button>
    </form>
  );
};
