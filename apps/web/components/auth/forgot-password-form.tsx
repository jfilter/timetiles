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
import { Button, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useTranslations } from "next-intl";

import { forgotPasswordRequest } from "@/lib/hooks/use-auth-mutations";
import { useInputState } from "@/lib/hooks/use-input-state";

export interface ForgotPasswordFormProps {
  /** Callback fired on successful submission */
  onSuccess?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export const ForgotPasswordForm = ({ onSuccess, className }: Readonly<ForgotPasswordFormProps>) => {
  const t = useTranslations("Auth");
  const [email, handleEmailChange] = useInputState();
  const { status, error, isPending, mutate } = useMutation({
    mutationFn: forgotPasswordRequest,
    onSuccess: () => onSuccess?.(),
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email) return;

    mutate({ email });
  };

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
          <h3 className="text-lg font-semibold">{t("emailSentTitle")}</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            {t.rich("emailSentDescription", { email, strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="forgot-email">{t("emailLabel")}</Label>
        <Input
          id="forgot-email"
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder={t("emailPlaceholder")}
          disabled={isPending}
          required
          autoComplete="email"
        />
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("sending") : t("sendResetLink")}
      </Button>
    </form>
  );
};
