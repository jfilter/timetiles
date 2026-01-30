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

import type { LoginFormStatus } from "./types";

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
  const [status, setStatus] = useState<LoginFormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

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

      setStatus("loading");
      setErrorMessage("");

      void (async () => {
        try {
          const response = await fetch("/api/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            credentials: "include",
          });

          const data = await response.json();

          if (response.ok && data.user) {
            // Call success handler - it will handle updating auth state
            // Don't reload the page - let the parent handle the state update
            onSuccess?.();
          } else {
            const message = data.errors?.[0]?.message ?? data.message ?? "Invalid email or password";
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
    [email, password, onSuccess, onError]
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
          disabled={status === "loading"}
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
          disabled={status === "loading"}
          required
          autoComplete="current-password"
        />
      </div>

      {errorMessage && (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={status === "loading"}>
        {status === "loading" ? "Signing in..." : "Sign In"}
      </Button>

      <div className="text-center">
        <Link href="/forgot-password" className="text-primary text-sm hover:underline">
          Forgot your password?
        </Link>
      </div>
    </form>
  );
};
