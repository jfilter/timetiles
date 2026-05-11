/**
 * Legacy data-packages URL.
 *
 * Redirects to the account-scoped page so existing external links keep working.
 *
 * @module
 */
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function DataPackagesRedirect() {
  const locale = await getLocale();
  return redirect({ href: "/account/data-packages", locale });
}
