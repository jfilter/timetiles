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

import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { PageLayout } from "@/components/layout/page-layout";

type VerificationStatus = "loading" | "success" | "error" | "no-token";

const VerifyEmailContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<VerificationStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const token = searchParams.get("token");

  const verifyEmail = useCallback(
    async (verificationToken: string) => {
      try {
        const response = await fetch(`/api/users/verify/${verificationToken}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          setStatus("success");
          // Redirect to import page after 3 seconds
          setTimeout(() => {
            router.push("/import");
          }, 3000);
        } else {
          const errorData: unknown = await response.json().catch(() => ({}));
          const message =
            typeof errorData === "object" && errorData !== null && "message" in errorData
              ? String(errorData.message)
              : "Failed to verify email. The link may have expired.";
          setErrorMessage(message);
          setStatus("error");
        }
      } catch {
        setErrorMessage("An error occurred while verifying your email. Please try again.");
        setStatus("error");
      }
    },
    [router]
  );

  useEffect(() => {
    if (!token) {
      setStatus("no-token");
      return;
    }

    void verifyEmail(token);
  }, [token, verifyEmail]);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageLayout title="Email Verification" maxWidth="md" centered>
        <div className="rounded-lg bg-white p-8 shadow-md">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
              <h2 className="text-xl font-semibold text-gray-900">Verifying your email...</h2>
              <p className="text-gray-600">Please wait while we verify your email address.</p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h2 className="text-xl font-semibold text-gray-900">Email Verified!</h2>
              <p className="text-gray-600">
                Your email has been successfully verified. You can now complete your imports.
              </p>
              <p className="text-sm text-gray-500">Redirecting you to the import page...</p>
              <Link
                href="/import"
                className="mt-4 rounded-md bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
              >
                Go to Import Page
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <h2 className="text-xl font-semibold text-gray-900">Verification Failed</h2>
              <p className="text-gray-600">{errorMessage}</p>
              <div className="mt-4 flex gap-4">
                <Link
                  href="/login"
                  className="rounded-md bg-gray-200 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-300"
                >
                  Go to Login
                </Link>
                <Link
                  href="/import"
                  className="rounded-md bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
                >
                  Go to Import Page
                </Link>
              </div>
            </div>
          )}

          {status === "no-token" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-yellow-500" />
              <h2 className="text-xl font-semibold text-gray-900">No Verification Token</h2>
              <p className="text-gray-600">
                No verification token was provided. Please check your email for the verification link.
              </p>
              <Link
                href="/"
                className="mt-4 rounded-md bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
              >
                Go to Homepage
              </Link>
            </div>
          )}
        </div>
      </PageLayout>
    </div>
  );
};

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <PageLayout title="Email Verification" maxWidth="md" centered>
            <div className="rounded-lg bg-white p-8 shadow-md">
              <div className="flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                <h2 className="text-xl font-semibold text-gray-900">Loading...</h2>
              </div>
            </div>
          </PageLayout>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
