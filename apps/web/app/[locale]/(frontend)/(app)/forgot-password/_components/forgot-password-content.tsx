/**
 * Client component for forgot password page content.
 *
 * Renders the forgot password form with centered layout matching
 * the login page pattern.
 *
 * @module
 * @category Components
 */
"use client";

import { useTranslations } from "next-intl";

import { ForgotPasswordForm } from "@/components/auth";
import { Link } from "@/i18n/navigation";

export const ForgotPasswordContent = () => {
  const t = useTranslations("Auth");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-foreground dark:text-foreground text-3xl font-bold">{t("resetYourPassword")}</h1>
          <p className="text-muted-foreground mt-2">{t("resetDescription")}</p>
        </div>
        <ForgotPasswordForm />
        <div className="mt-6 text-center">
          <Link href="/login" className="text-primary text-sm hover:underline">
            {t("backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
};
