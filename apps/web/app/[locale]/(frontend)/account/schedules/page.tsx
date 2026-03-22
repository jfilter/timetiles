/**
 * scheduled ingests management page.
 *
 * Allows users to view and manage their scheduled URL imports.
 *
 * @module
 * @category Pages
 */
import { headers as nextHeaders } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { redirect } from "@/i18n/navigation";
import { redirectIfNotDefaultSite } from "@/lib/api/server-page-helpers";
import config from "@/payload.config";

import { SchedulesListClient } from "./_components/schedules-list-client";

export const metadata = { title: "scheduled ingests | TimeTiles", description: "Manage your scheduled data imports" };

export default async function SchedulesPage() {
  const payload = await getPayload({ config });
  const headers = await nextHeaders();
  const locale = await getLocale();

  const { user } = await payload.auth({ headers });

  if (!user) {
    return redirect({ href: "/login?redirect=/account/schedules", locale });
  }

  await redirectIfNotDefaultSite(payload, headers, locale);

  // Fetch user's scheduled ingests
  const schedulesResult = await payload.find({
    collection: "scheduled-ingests",
    where: { createdBy: { equals: user.id } },
    sort: "-updatedAt",
    limit: 200,
    pagination: false,
    depth: 1,
  });

  const t = await getTranslations("Schedules");

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("description")}</p>
        </div>
      </div>

      <SchedulesListClient initialSchedules={schedulesResult.docs} />
    </div>
  );
}
