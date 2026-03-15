/**
 * This file defines the main data exploration page of the application.
 *
 * Resolves the active view from search params and wraps the explorer
 * in a ViewProvider. The site is resolved in the layout above.
 *
 * URL patterns:
 * - /explore — default view for the active site
 * - /explore?view=parks — named view within the active site
 *
 * @module
 */
import Link from "next/link";
import { headers } from "next/headers";
import { getPayload } from "payload";

import { ViewProvider } from "@/lib/context/view-context";
import { resolveSite } from "@/lib/services/site-resolver";
import { resolveView } from "@/lib/services/view-resolver";
import config from "@/payload.config";

import { ExploreContent } from "./_components/explore-content";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

interface ExplorePageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExplorePage({ searchParams }: Readonly<ExplorePageProps>) {
  const payload = await getPayload({ config });
  const headersList = await headers();
  const host = headersList.get("host");

  // Resolve site from domain
  const site = await resolveSite(payload, host);
  const siteId = site?.id;

  // Resolve view from search params
  const params = await searchParams;
  const viewSlug = typeof params.view === "string" ? params.view : undefined;
  const view = await resolveView(payload, siteId, viewSlug);

  if (!view) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Site not configured</h1>
        <p className="text-muted-foreground max-w-md">
          This site needs a default view to display the explorer. Please configure one in the admin dashboard.
        </p>
        <Link
          href="/dashboard/collections/views"
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <ViewProvider view={view}>
      <ExploreContent />
    </ViewProvider>
  );
}
