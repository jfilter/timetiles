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
import { useCallback, useState } from "react";

import { useFormSubmission } from "@/lib/hooks/use-form-submission";

export interface LoginFormProps {
  /** Callback fired on successful login */
  onSuccess?: () => void;
  /** Callback fired on login error */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
}

export const LoginForm = ({ onSuccess, onError, className }: Readonly<LoginFormProps>) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { error, isLoading, submit } = useFormSubmission();

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!email || !password) return;

      submit(async () => {
        const response = await fetch("/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          credentials: "include",
        });

        const data = await response.json();

        if (response.ok && data.user) {
          onSuccess?.();
          return;
        }

        const message = data.errors?.[0]?.message ?? data.message ?? "Invalid email or password";
        onError?.(message);
        throw new Error(message);
      });
    },
    [email, password, onSuccess, onError, submit]
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
