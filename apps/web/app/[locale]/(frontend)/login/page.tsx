/**
 * Login page for user authentication.
 *
 * Server component that checks if user is already authenticated and redirects
 * if so. Renders the login page content for unauthenticated users.
 *
 * @module
 * @category Pages
 */
import config from "@payload-config";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { getPayload } from "payload";

import { redirect } from "@/i18n/navigation";

import { LoginPageContent } from "./_components/login-page-content";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Check if user is already logged in
  const payload = await getPayload({ config });
  const headersList = await headers();
  const { user } = await payload.auth({ headers: headersList });

  // Redirect authenticated users to home
  if (user) {
    const locale = await getLocale();
    redirect({ href: "/", locale });
  }

  return <LoginPageContent />;
}
