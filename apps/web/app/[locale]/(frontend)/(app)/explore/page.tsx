/**
 * Main data exploration page.
 *
 * Resolves the active view via ExploreViewResolver and renders the
 * responsive explorer (map on desktop, list on mobile).
 *
 * URL patterns:
 * - /explore — default view for the active site
 * - /explore?view=parks — named view within the active site
 *
 * @module
 */
import { ExploreContent } from "./_components/explore-content";
import { ExploreViewResolver } from "./_components/explore-view-resolver";

interface ExplorePageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function ExplorePage({ searchParams }: Readonly<ExplorePageProps>) {
  return (
    <ExploreViewResolver searchParams={searchParams}>
      <ExploreContent />
    </ExploreViewResolver>
  );
}
