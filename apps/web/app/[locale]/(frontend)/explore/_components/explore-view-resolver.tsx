/**
 * Server component that resolves the active site and view for explore pages.
 *
 * Shared by both `/explore` and `/explore/list` to eliminate duplicated
 * bootstrap logic. Renders an i18n error fallback if no view is configured.
 *
 * @module
 * @category Components
 */
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { Link } from "@/i18n/navigation";
import { ViewProvider } from "@/lib/context/view-context";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import { resolveView } from "@/lib/services/resolution/view-resolver";
import config from "@/payload.config";

interface ExploreViewResolverProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Override the view slug directly (used by embed routes with slug in URL path). */
  readonly viewSlug?: string;
  readonly children: React.ReactNode;
}

export const ExploreViewResolver = async ({
  searchParams,
  viewSlug: viewSlugProp,
  children,
}: ExploreViewResolverProps) => {
  const payload = await getPayload({ config });
  const headersList = await headers();
  const host = headersList.get("host");

  const site = await resolveSite(payload, host);
  const siteId = site?.id;

  const params = await searchParams;
  const viewSlugFromParams = typeof params.view === "string" ? params.view : undefined;
  const viewSlug = viewSlugProp ?? viewSlugFromParams;
  const view = await resolveView(payload, siteId, viewSlug);

  if (!view) {
    const t = await getTranslations("Explore");
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">{t("siteNotConfigured")}</h1>
        <p className="text-muted-foreground max-w-md">{t("siteNotConfiguredDescription")}</p>
        <Link
          href="/dashboard/collections/views"
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          {t("goToDashboard")}
        </Link>
      </div>
    );
  }

  return <ViewProvider view={view}>{children}</ViewProvider>;
};
