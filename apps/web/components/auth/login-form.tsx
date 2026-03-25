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

import { useMutation } from "@tanstack/react-query";
import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { loginRequest } from "@/lib/hooks/use-auth-mutations";
import { useInputState } from "@/lib/hooks/use-input-state";

import { AuthFormField } from "./auth-form-field";
import { FormError } from "./form-feedback";

export interface LoginFormProps {
  /** Callback fired on successful login */
  onSuccess?: () => void;
  /** Callback fired on login error */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
}

export const LoginForm = ({ onSuccess, onError, className }: Readonly<LoginFormProps>) => {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const [email, handleEmailChange] = useInputState();
  const [password, handlePasswordChange] = useInputState();
  const { error, isPending, mutate } = useMutation({
    mutationFn: loginRequest,
    onSuccess: () => onSuccess?.(),
    onError: (err: Error) => onError?.(err.message),
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email || !password) return;

    mutate({ email, password });
  };

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <AuthFormField
        id="login-email"
        label={t("emailLabel")}
        type="email"
        value={email}
        onChange={handleEmailChange}
        placeholder={t("emailPlaceholder")}
        disabled={isPending}
        required
        autoComplete="email"
      />

      <AuthFormField
        id="login-password"
        label={t("passwordLabel")}
        type="password"
        value={password}
        onChange={handlePasswordChange}
        placeholder={t("passwordPlaceholder")}
        disabled={isPending}
        required
        autoComplete="current-password"
      />

      <FormError error={error} />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("signingIn") : tCommon("signIn")}
      </Button>

      <div className="text-center">
        <Link href="/forgot-password" className="text-primary text-sm hover:underline">
          {t("forgotPassword")}
        </Link>
      </div>
    </form>
  );
};
