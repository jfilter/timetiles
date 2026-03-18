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
import { useTranslations } from "next-intl";

import { validatePasswords } from "@/lib/constants/validation";
import { resetPasswordRequest } from "@/lib/hooks/use-auth-mutations";
import { useFormMutation } from "@/lib/hooks/use-form-mutation";
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
  const t = useTranslations("Auth");
  const [password, handlePasswordChange] = useInputState();
  const [confirmPassword, handleConfirmPasswordChange] = useInputState();
  const { status, error, isLoading, mutate } = useFormMutation({
    mutationFn: async (input: { token: string; password: string; confirmPassword: string }) => {
      validatePasswords(input.password, input.confirmPassword);

      return resetPasswordRequest({ token: input.token, password: input.password });
    },
    onSuccess: () => onSuccess?.(),
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!password || !confirmPassword) return;

    mutate({ token, password, confirmPassword });
  };

  if (status === "success") {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="reset-password">{t("newPasswordLabel")}</Label>
        <Input
          id="reset-password"
          type="password"
          value={password}
          onChange={handlePasswordChange}
          placeholder={t("newPasswordPlaceholder")}
          disabled={isLoading}
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reset-confirm-password">{t("confirmPasswordLabel")}</Label>
        <Input
          id="reset-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          placeholder={t("confirmPasswordPlaceholder")}
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
        {isLoading ? t("resetting") : t("resetPassword")}
      </Button>
    </form>
  );
};
