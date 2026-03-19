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

import { useMutation } from "@tanstack/react-query";
import { Button, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { Lock, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { validatePasswords } from "@/lib/constants/validation";
import { registerRequest } from "@/lib/hooks/use-auth-mutations";
import { useFeatureEnabled } from "@/lib/hooks/use-feature-flags";
import { useInputState } from "@/lib/hooks/use-input-state";

import { FormError, FormSuccess } from "./form-feedback";

export interface RegisterFormProps {
  /** Callback fired on successful registration */
  onSuccess?: () => void;
  /** Callback fired on registration error */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
}

export const RegisterForm = ({ onSuccess, onError, className }: Readonly<RegisterFormProps>) => {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const { isEnabled: registrationEnabled, isLoading: flagsLoading } = useFeatureEnabled("enableRegistration");
  const [email, handleEmailChange] = useInputState();
  const [password, handlePasswordChange] = useInputState();
  const [confirmPassword, handleConfirmPasswordChange] = useInputState();
  const { status, error, isPending, mutate } = useMutation({
    mutationFn: async (input: { email: string; password: string; confirmPassword: string }) => {
      validatePasswords(input.password, input.confirmPassword);

      return registerRequest({ email: input.email, password: input.password });
    },
    onSuccess: () => onSuccess?.(),
    onError: (err: Error) => onError?.(err.message),
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email || !password || !confirmPassword) return;

    mutate({ email, password, confirmPassword });
  };

  // Show loading state while checking feature flags
  if (flagsLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <div className="text-muted-foreground">{tCommon("loading")}</div>
      </div>
    );
  }

  // Show message when registration is disabled
  if (!registrationEnabled) {
    return (
      <div className={cn("space-y-4 text-center", className)}>
        <div className="bg-muted/50 border-border rounded-sm border p-6">
          <Lock className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h3 className="text-lg font-semibold">{t("registrationUnavailable")}</h3>
          <p className="text-muted-foreground mt-2 text-sm">{t("registrationDisabled")}</p>
        </div>
      </div>
    );
  }

  // Show success message after registration
  if (status === "success") {
    return (
      <FormSuccess
        show
        icon={Mail}
        title={t("checkYourEmail")}
        description={t.rich("verificationSent", { email, strong: (chunks) => <strong>{chunks}</strong> })}
        className={className}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="register-email">{t("emailLabel")}</Label>
        <Input
          id="register-email"
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder={t("registerEmailPlaceholder")}
          disabled={isPending}
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password">{t("passwordLabel")}</Label>
        <Input
          id="register-password"
          type="password"
          value={password}
          onChange={handlePasswordChange}
          placeholder={t("registerPasswordPlaceholder")}
          disabled={isPending}
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-confirm-password">{t("confirmPasswordLabel")}</Label>
        <Input
          id="register-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          placeholder={t("confirmPasswordPlaceholder")}
          disabled={isPending}
          required
          autoComplete="new-password"
        />
      </div>

      <FormError error={error} />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("creatingAccount") : t("createAccount")}
      </Button>

      <p className="text-muted-foreground text-center text-xs">{t("termsNotice")}</p>
    </form>
  );
};
