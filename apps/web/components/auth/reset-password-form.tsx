/**
 * Reset password form component for setting a new password.
 *
 * Uses Payload CMS built-in reset-password endpoint with a token
 * from the password reset email.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useCallback, useState } from "react";

export interface ResetPasswordFormProps {
  /** Reset token from the email link */
  token: string;
  /** Callback fired on successful password reset */
  onSuccess?: () => void;
  /** Additional CSS classes */
  className?: string;
}

type FormStatus = "idle" | "loading" | "success" | "error";

export const ResetPasswordForm = ({ token, onSuccess, className }: Readonly<ResetPasswordFormProps>) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }, []);

  const handleConfirmPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!password || !confirmPassword) return;

      if (password !== confirmPassword) {
        setStatus("error");
        setErrorMessage("Passwords do not match");
        return;
      }

      if (password.length < 8) {
        setStatus("error");
        setErrorMessage("Password must be at least 8 characters");
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      void (async () => {
        try {
          const response = await fetch("/api/users/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
          });

          if (response.ok) {
            setStatus("success");
            onSuccess?.();
          } else {
            const data = await response.json().catch(() => ({}));
            const message =
              typeof data === "object" && data !== null && "message" in data
                ? String(data.message)
                : "Failed to reset password. The link may have expired.";
            setStatus("error");
            setErrorMessage(message);
          }
        } catch {
          setStatus("error");
          setErrorMessage("Network error. Please try again.");
        }
      })();
    },
    [password, confirmPassword, token, onSuccess]
  );

  if (status === "success") {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="reset-password">New Password</Label>
        <Input
          id="reset-password"
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
        <Label htmlFor="reset-confirm-password">Confirm Password</Label>
        <Input
          id="reset-confirm-password"
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
        {status === "loading" ? "Resetting..." : "Reset Password"}
      </Button>
    </form>
  );
};
