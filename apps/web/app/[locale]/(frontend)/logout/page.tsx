/**
 * Logout page that signs out the user and redirects to home.
 *
 * Server component that calls the Payload logout endpoint and redirects.
 *
 * @module
 * @category Pages
 */
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function LogoutPage() {
  const headersList = await headers();

  // Attempt to logout (clears the auth cookie)
  try {
    await fetch(`${process.env.NEXT_PUBLIC_PAYLOAD_URL}/api/users/logout`, {
      method: "POST",
      headers: { cookie: headersList.get("cookie") ?? "" },
    });
  } catch {
    // Ignore errors - redirect anyway
  }

  const locale = await getLocale();
  redirect({ href: "/", locale });
}
