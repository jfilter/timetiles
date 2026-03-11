/**
 * Login form component for user authentication.
 *
 * Uses Payload CMS built-in authentication endpoint to log users in.
 * Displays error messages for invalid credentials and handles loading states.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import Link from "next/link";
import { useCallback } from "react";

import { useLoginMutation } from "@/lib/hooks/use-auth-mutations";
import { useFormSubmission } from "@/lib/hooks/use-form-submission";
import { useInputState } from "@/lib/hooks/use-input-state";

export interface LoginFormProps {
  /** Callback fired on successful login */
  onSuccess?: () => void;
  /** Callback fired on login error */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
}

export const LoginForm = ({ onSuccess, onError, className }: Readonly<LoginFormProps>) => {
  const [email, handleEmailChange] = useInputState();
  const [password, handlePasswordChange] = useInputState();
  const { error, isLoading, submit } = useFormSubmission();
  const loginMutation = useLoginMutation();

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!email || !password) return;

      submit(async () => {
        try {
          await loginMutation.mutateAsync({ email, password });
          onSuccess?.();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Invalid email or password";
          onError?.(message);
          throw err;
        }
      });
    },
    [email, password, onSuccess, onError, submit, loginMutation]
  );

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
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
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={handlePasswordChange}
          placeholder="Enter your password"
          disabled={isLoading}
          required
          autoComplete="current-password"
        />
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>

      <div className="text-center">
        <Link href="/forgot-password" className="text-primary text-sm hover:underline">
          Forgot your password?
        </Link>
      </div>
    </form>
  );
};
