/**
 * Scheduled imports management page.
 *
 * Allows users to view and manage their scheduled URL imports.
 *
 * @module
 * @category Pages
 */
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";

import config from "@/payload.config";

import { SchedulesListClient } from "./_components/schedules-list-client";

export const metadata = {
  title: "Scheduled Imports | TimeTiles",
  description: "Manage your scheduled data imports",
};

export default async function SchedulesPage() {
  const payload = await getPayload({ config });
  const headers = await nextHeaders();

  const { user } = await payload.auth({ headers });

  if (!user) {
    redirect("/login?redirect=/account/schedules");
  }

  // Fetch user's scheduled imports
  const schedulesResult = await payload.find({
    collection: "scheduled-imports",
    where: {
      createdBy: { equals: user.id },
    },
    sort: "-updatedAt",
    limit: 50,
    depth: 1,
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scheduled Imports</h1>
          <p className="text-muted-foreground mt-1">Manage your automatic data imports from URLs</p>
        </div>
      </div>

      <SchedulesListClient initialSchedules={schedulesResult.docs} />
    </div>
  );
}
