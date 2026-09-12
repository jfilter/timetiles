/**
 * Email verification landing page.
 *
 * Handles the email verification token from URL parameters and verifies
 * the user's email address using Payload's built-in verification endpoint.
 *
 * @module
 * @category Pages
 */
"use client";

import { Button } from "@timetiles/ui";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect } from "react";

import { PageLayout } from "@/components/layout/page-layout";
import { Link, useRouter } from "@/i18n/navigation";
import { useVerifyEmailMutation } from "@/lib/hooks/use-auth-mutations";

type VerificationStatus = "idle" | "loading" | "success" | "error" | "no-token";

const VerifyEmailContent = ({ token }: { readonly token: string | null }) => {
  const router = useRouter();
  const t = useTranslations("VerifyEmail");
  const tCommon = useTranslations("Common");

  const mutation = useVerifyEmailMutation();
  const { mutate } = mutation;

  // Defer until after effect replay; a discarded mount must not consume the token.
  useEffect(() => {
    if (!token) return;
    const timeout = setTimeout(() => mutate(token), 0);
    return () => clearTimeout(timeout);
  }, [token, mutate]);

  // Auto-redirect after successful verification
  useEffect(() => {
    if (mutation.isSuccess) {
      const timeout = setTimeout(() => router.push("/ingest"), 3000);
      return () => clearTimeout(timeout);
    }
  }, [mutation.isSuccess, router]);

  const getStatus = (): VerificationStatus => {
    if (!token) return "no-token";
    if (mutation.isSuccess) return "success";
    if (mutation.isError) return "error";
    return "loading";
  };
  const status = getStatus();
  const errorMessage = mutation.error?.message ?? "";

  return (
    <div className="min-h-screen bg-gray-50">
      <PageLayout title={t("pageTitle")} maxWidth="md" centered>
        <div className="rounded-lg bg-white p-8 shadow-md">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
              <h2 className="text-xl font-semibold text-gray-900">{t("verifying")}</h2>
              <p className="text-gray-600">{t("verifyingDescription")}</p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h2 className="text-xl font-semibold text-gray-900">{t("verified")}</h2>
              <p className="text-gray-600">{t("verifiedDescription")}</p>
              <p className="text-sm text-gray-500">{t("redirecting")}</p>
              <Link
                href="/ingest"
                className="mt-4 rounded-md bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
              >
                {t("goToImport")}
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <h2 className="text-xl font-semibold text-gray-900">{t("failed")}</h2>
              <p className="text-gray-600">{errorMessage}</p>
              <Button onClick={() => token && mutation.mutate(token)}>{tCommon("tryAgain")}</Button>
              <div className="mt-4 flex gap-4">
                <Link
                  href="/login"
                  className="rounded-md bg-gray-200 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-300"
                >
                  {t("goToLogin")}
                </Link>
                <Link
                  href="/ingest"
                  className="rounded-md bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
                >
                  {t("goToImport")}
                </Link>
              </div>
            </div>
          )}

          {status === "no-token" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-yellow-500" />
              <h2 className="text-xl font-semibold text-gray-900">{t("noToken")}</h2>
              <p className="text-gray-600">{t("noTokenDescription")}</p>
              <Link
                href="/"
                className="mt-4 rounded-md bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
              >
                {t("goToHomepage")}
              </Link>
            </div>
          )}
        </div>
      </PageLayout>
    </div>
  );
};

const VerifyEmailFromUrl = () => {
  const token = useSearchParams().get("token");
  return <VerifyEmailContent key={token} token={token} />;
};

export default function VerifyEmailPage() {
  const t = useTranslations("VerifyEmail");
  const tCommon = useTranslations("Common");

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <PageLayout title={t("pageTitle")} maxWidth="md" centered>
            <div className="rounded-lg bg-white p-8 shadow-md">
              <div className="flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                <h2 className="text-xl font-semibold text-gray-900">{tCommon("loading")}</h2>
              </div>
            </div>
          </PageLayout>
        </div>
      }
    >
      <VerifyEmailFromUrl />
    </Suspense>
  );
}
