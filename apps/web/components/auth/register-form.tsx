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
import { Lock, Mail } from "lucide-react";
import { useCallback, useState } from "react";

import { useFeatureEnabled } from "@/lib/hooks/use-feature-flags";
import { useFormSubmission } from "@/lib/hooks/use-form-submission";

export interface RegisterFormProps {
  /** Callback fired on successful registration */
  onSuccess?: () => void;
  /** Callback fired on registration error */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
}

export const RegisterForm = ({ onSuccess, onError, className }: Readonly<RegisterFormProps>) => {
  const { isEnabled: registrationEnabled, isLoading: flagsLoading } = useFeatureEnabled("enableRegistration");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { status, error, isLoading, submit } = useFormSubmission();

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

      submit(async () => {
        // eslint-disable-next-line security/detect-possible-timing-attacks -- client-side UI validation, not a security comparison
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }

        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }

        // Use secure registration endpoint that prevents user enumeration
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          const message = data.error ?? "Registration failed. Please try again.";
          onError?.(message);
          throw new Error(message);
        }

        onSuccess?.();
      });
    },
    [email, password, confirmPassword, onSuccess, onError, submit]
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
          <Lock className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
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
          <Mail className="text-primary mx-auto mb-4 h-12 w-12" />
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
          disabled={isLoading}
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
          disabled={isLoading}
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
          disabled={isLoading}
          required
          autoComplete="new-password"
        />
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Creating account..." : "Create Account"}
      </Button>

      <p className="text-muted-foreground text-center text-xs">
        By registering, you agree to our terms of service and privacy policy.
      </p>
    </form>
  );
};
