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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { ResetPasswordForm } from "@/components/auth";

const ResetPasswordInner = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  const token = searchParams.get("token");

  const handleSuccess = useCallback(() => {
    setSuccess(true);
  }, []);

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
          <h1 className="text-cartographic-charcoal dark:text-cartographic-charcoal text-2xl font-bold">
            Invalid Reset Link
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            No reset token was provided. Please request a new password reset link.
          </p>
          <div className="mt-6">
            <Link href="/forgot-password" className="text-primary text-sm hover:underline">
              Request a new reset link
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
          <h1 className="text-cartographic-charcoal dark:text-cartographic-charcoal text-2xl font-bold">
            Password Reset
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your password has been successfully reset. Redirecting you to login...
          </p>
          <div className="mt-6">
            <Link href="/login" className="text-primary text-sm hover:underline">
              Go to login
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
          <h1 className="text-cartographic-charcoal dark:text-cartographic-charcoal text-3xl font-bold">
            Set new password
          </h1>
          <p className="text-muted-foreground mt-2">Enter your new password below.</p>
        </div>
        <ResetPasswordForm token={token} onSuccess={handleSuccess} />
        <div className="mt-6 text-center">
          <Link href="/login" className="text-primary text-sm hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

export const ResetPasswordContent = () => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
};
