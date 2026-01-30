/**
 * Registration form component for new user sign-up.
 *
 * Uses Payload CMS users collection for self-registration.
 * After registration, displays a message about email verification requirement.
 *
 * Security notes:
 * - The beforeChange hook on users collection forces role='user' and
 *   trustLevel='BASIC' for self-registered users, preventing privilege escalation.
 * - Email verification is required before users can complete imports.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useCallback, useState } from "react";

import { useFeatureEnabled } from "@/lib/hooks/use-feature-flags";

export interface RegisterFormProps {
  /** Callback fired on successful registration */
  onSuccess?: () => void;
  /** Callback fired on registration error */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
}

type FormStatus = "idle" | "loading" | "success" | "error";

export const RegisterForm = ({ onSuccess, onError, className }: Readonly<RegisterFormProps>) => {
  const { isEnabled: registrationEnabled, isLoading: flagsLoading } = useFeatureEnabled("enableRegistration");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }, []);

  const handleConfirmPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!email || !password || !confirmPassword) return;

      // Validate password match
      if (password !== confirmPassword) {
        setStatus("error");
        setErrorMessage("Passwords do not match");
        return;
      }

      // Validate password strength
      if (password.length < 8) {
        setStatus("error");
        setErrorMessage("Password must be at least 8 characters");
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      void (async () => {
        try {
          // Use secure registration endpoint that prevents user enumeration
          const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              password,
            }),
          });

          const data = await response.json();

          if (response.ok && data.success) {
            setStatus("success");
            onSuccess?.();
          } else {
            const message = data.error ?? "Registration failed. Please try again.";
            setStatus("error");
            setErrorMessage(message);
            onError?.(message);
          }
        } catch {
          const message = "Network error. Please try again.";
          setStatus("error");
          setErrorMessage(message);
          onError?.(message);
        }
      })();
    },
    [email, password, confirmPassword, onSuccess, onError]
  );

  // Show loading state while checking feature flags
  if (flagsLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Show message when registration is disabled
  if (!registrationEnabled) {
    return (
      <div className={cn("space-y-4 text-center", className)}>
        <div className="bg-muted/50 border-border rounded-sm border p-6">
          <svg
            className="text-muted-foreground mx-auto mb-4 h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h3 className="text-lg font-semibold">Registration Unavailable</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            New account registration is currently disabled. Please contact an administrator if you need access.
          </p>
        </div>
      </div>
    );
  }

  // Show success message after registration
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
            We&apos;ve sent a verification link to <strong>{email}</strong>. Please click the link to verify your
            account before signing in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder="you@example.com"
          disabled={status === "loading"}
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          type="password"
          value={password}
          onChange={handlePasswordChange}
          placeholder="At least 8 characters"
          disabled={status === "loading"}
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-confirm-password">Confirm Password</Label>
        <Input
          id="register-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          placeholder="Repeat your password"
          disabled={status === "loading"}
          required
          autoComplete="new-password"
        />
      </div>

      {errorMessage && (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={status === "loading"}>
        {status === "loading" ? "Creating account..." : "Create Account"}
      </Button>

      <p className="text-muted-foreground text-center text-xs">
        By registering, you agree to our terms of service and privacy policy.
      </p>
    </form>
  );
};
