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

import { useMutation } from "@tanstack/react-query";
import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { forgotPasswordRequest } from "@/lib/hooks/use-auth-mutations";
import { useInputState } from "@/lib/hooks/use-input-state";

import { AuthFormField } from "./auth-form-field";
import { FormError, FormSuccess } from "./form-feedback";

export interface ForgotPasswordFormProps {
  /** Callback fired on successful submission */
  onSuccess?: () => void;
  /** Callback fired on submission error */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
}

export const ForgotPasswordForm = ({ onSuccess, onError, className }: Readonly<ForgotPasswordFormProps>) => {
  const t = useTranslations("Auth");
  const [email, handleEmailChange] = useInputState();
  const { status, error, isPending, mutate } = useMutation({
    mutationFn: forgotPasswordRequest,
    onSuccess: () => onSuccess?.(),
    onError: (err: Error) => onError?.(err.message),
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email) return;

    mutate({ email });
  };

  if (status === "success") {
    return (
      <FormSuccess
        show
        icon={Mail}
        title={t("emailSentTitle")}
        description={t.rich("emailSentDescription", { email, strong: (chunks) => <strong>{chunks}</strong> })}
        className={className}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <AuthFormField
        id="forgot-email"
        label={t("emailLabel")}
        type="email"
        value={email}
        onChange={handleEmailChange}
        placeholder={t("emailPlaceholder")}
        disabled={isPending}
        required
        autoComplete="email"
      />

      <FormError error={error} />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("sending") : t("sendResetLink")}
      </Button>
    </form>
  );
};
