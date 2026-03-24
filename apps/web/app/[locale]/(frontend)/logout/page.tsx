/**
 * Logout page that signs out the user and redirects to home.
 *
 * Server component that calls the Payload logout endpoint and redirects.
 * Uses the same endpoint as the client-side logout in use-auth-mutations.ts.
 *
 * @module
 * @category Pages
 */
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

const LOGOUT_URL = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/api/users/logout`;

export default async function LogoutPage() {
  const headersList = await headers();

  try {
    await fetch(LOGOUT_URL, { method: "POST", headers: { cookie: headersList.get("cookie") ?? "" } });
  } catch {
    // Ignore errors - redirect anyway (session cookie will be cleared)
  }

  const locale = await getLocale();
  redirect({ href: "/", locale });
}
