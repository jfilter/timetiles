/**
 * Forgot password page for requesting a password reset email.
 *
 * Server component that checks if user is already authenticated and redirects
 * if so. Renders the forgot password content for unauthenticated users.
 *
 * @module
 * @category Pages
 */
import config from "@payload-config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";

import { ForgotPasswordContent } from "./_components/forgot-password-content";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const payload = await getPayload({ config });
  const headersList = await headers();
  const { user } = await payload.auth({ headers: headersList });

  if (user) {
    redirect("/");
  }

  return <ForgotPasswordContent />;
}
