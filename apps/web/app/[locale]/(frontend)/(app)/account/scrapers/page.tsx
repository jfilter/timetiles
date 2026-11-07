/**
 * Redirect to the unified import activity dashboard.
 *
 * @module
 * @category Pages
 */
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function ScrapersPage() {
  const locale = await getLocale();
  return redirect({ href: "/account/imports?tab=scrapers", locale });
}
