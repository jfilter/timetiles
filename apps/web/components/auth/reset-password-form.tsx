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
import { useCallback } from "react";

import { MIN_PASSWORD_LENGTH } from "@/lib/constants/validation";
import { useResetPasswordMutation } from "@/lib/hooks/use-auth-mutations";
import { useFormSubmission } from "@/lib/hooks/use-form-submission";
import { useInputState } from "@/lib/hooks/use-input-state";

export interface ResetPasswordFormProps {
  /** Reset token from the email link */
  token: string;
  /** Callback fired on successful password reset */
  onSuccess?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export const ResetPasswordForm = ({ token, onSuccess, className }: Readonly<ResetPasswordFormProps>) => {
  const [password, handlePasswordChange] = useInputState();
  const [confirmPassword, handleConfirmPasswordChange] = useInputState();
  const { status, error, isLoading, submit } = useFormSubmission();
  const resetPasswordMutation = useResetPasswordMutation();

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!password || !confirmPassword) return;

      submit(async () => {
        // eslint-disable-next-line security/detect-possible-timing-attacks -- client-side UI validation, not a security comparison
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }

        await resetPasswordMutation.mutateAsync({ token, password });
        onSuccess?.();
      });
    },
    [password, confirmPassword, token, onSuccess, submit, resetPasswordMutation]
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
          disabled={isLoading}
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
        {isLoading ? "Resetting..." : "Reset Password"}
      </Button>
    </form>
  );
};
