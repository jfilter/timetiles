/**
 * Default embed page — renders the site's default view without chrome.
 *
 * Reuses the same {@link ExploreViewResolver} and {@link ExploreContent}
 * components as the main `/explore` page.
 *
 * @module
 */
import { EmbedAttribution } from "@/components/embed/embed-attribution";

import { ExploreContent } from "../../(frontend)/explore/_components/explore-content";
import { ExploreViewResolver } from "../../(frontend)/explore/_components/explore-view-resolver";

export const dynamic = "force-dynamic";

interface EmbedPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function EmbedPage({ searchParams }: Readonly<EmbedPageProps>) {
  return (
    <ExploreViewResolver searchParams={searchParams}>
      <ExploreContent />
      <EmbedAttribution />
    </ExploreViewResolver>
  );
}
