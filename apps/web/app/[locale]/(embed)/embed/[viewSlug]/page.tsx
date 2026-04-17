/**
 * Embed page for a specific view, identified by slug in the URL path.
 *
 * URL pattern: `/embed/city-events` or `/de/embed/city-events`
 *
 * @module
 */
import { EmbedAttribution } from "@/components/embed/embed-attribution";

import { ExploreContent } from "../../../(frontend)/explore/_components/explore-content";
import { ExploreViewResolver } from "../../../(frontend)/explore/_components/explore-view-resolver";

interface EmbedViewPageProps {
  readonly params: Promise<{ viewSlug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EmbedViewPage({ params, searchParams }: Readonly<EmbedViewPageProps>) {
  const { viewSlug } = await params;

  return (
    <ExploreViewResolver searchParams={searchParams} viewSlug={viewSlug}>
      <ExploreContent />
      <EmbedAttribution />
    </ExploreViewResolver>
  );
}
