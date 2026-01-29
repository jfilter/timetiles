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

import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth";

export const ForgotPasswordContent = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-cartographic-charcoal dark:text-cartographic-charcoal text-3xl font-bold">
            Reset your password
          </h1>
          <p className="text-muted-foreground mt-2">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </div>
        <ForgotPasswordForm />
        <div className="mt-6 text-center">
          <Link href="/login" className="text-primary text-sm hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};
