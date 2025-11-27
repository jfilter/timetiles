/**
 * Client component for login page content.
 *
 * Renders the AuthTabs component and handles navigation after successful
 * authentication using full page navigation to ensure server components
 * re-render with updated auth state.
 *
 * @module
 * @category Components
 */
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";

import { AuthTabs } from "@/components/auth";

const LoginContent = () => {
  const searchParams = useSearchParams();

  const redirectTo = searchParams.get("redirect") ?? "/";

  const handleSuccess = useCallback(() => {
    // Use full page navigation to ensure server components re-render with new auth state
    // router.refresh() + router.push() has race condition where navigation happens before refresh
    window.location.href = redirectTo;
  }, [redirectTo]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-cartographic-charcoal dark:text-cartographic-charcoal text-3xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground mt-2">Sign in to your account or create a new one</p>
      </div>
      <AuthTabs onSuccess={handleSuccess} />
    </div>
  );
};

export const LoginPageContent = () => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
};
