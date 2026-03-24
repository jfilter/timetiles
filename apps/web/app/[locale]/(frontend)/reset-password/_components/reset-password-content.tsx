/**
 * Client component for reset password page content.
 *
 * Reads the reset token from URL search params and renders the
 * reset password form. Shows an error if no token is provided.
 * On success, auto-redirects to login after 3 seconds.
 *
 * @module
 * @category Components
 */
"use client";

import { AlertCircle, CheckCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";

import { ResetPasswordForm } from "@/components/auth";
import { Link, useRouter } from "@/i18n/navigation";

const ResetPasswordInner = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("Auth");
  const [success, setSuccess] = useState(false);

  const token = searchParams.get("token");

  const handleSuccess = () => {
    setSuccess(true);
  };

  useEffect(() => {
    if (success) {
      const timeout = setTimeout(() => {
        router.push("/login");
      }, 3000);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [success, router]);

  if (!token) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <AlertCircle className="text-destructive mx-auto mb-4 h-12 w-12" />
          <h1 className="text-foreground dark:text-foreground text-2xl font-bold">{t("invalidResetLink")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t("noResetToken")}</p>
          <div className="mt-6">
            <Link href="/forgot-password" className="text-primary text-sm hover:underline">
              {t("requestNewResetLink")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
          <h1 className="text-foreground dark:text-foreground text-2xl font-bold">{t("passwordResetSuccess")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t("passwordResetSuccessMessage")}</p>
          <div className="mt-6">
            <Link href="/login" className="text-primary text-sm hover:underline">
              {t("goToLogin")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-foreground dark:text-foreground text-3xl font-bold">{t("setNewPassword")}</h1>
          <p className="text-muted-foreground mt-2">{t("setNewPasswordDescription")}</p>
        </div>
        <ResetPasswordForm token={token} onSuccess={handleSuccess} />
        <div className="mt-6 text-center">
          <Link href="/login" className="text-primary text-sm hover:underline">
            {t("backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
};

export const ResetPasswordContent = () => {
  const tCommon = useTranslations("Common");

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-muted-foreground">{tCommon("loading")}</div>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
};
