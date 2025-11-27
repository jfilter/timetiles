/**
 * This file defines the list-based data exploration page.
 *
 * It fetches the initial data required for the `ListExplorer` component,
 * specifically the list of all available catalogs and datasets. This view
 * provides an alternative to the map-focused explore page, with a collapsible
 * header containing filters, map preview, and chart, with the main focus
 * on a paginated event list below.
 *
 * @module
 */
import { getPayload } from "payload";
import { Suspense } from "react";

import { ListExplorer } from "@/app/(frontend)/explore/_components/list-explorer";
import config from "@/payload.config";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

const LOADING_ELEMENT = <div>Loading explorer...</div>;

export default async function ExploreListPage() {
  const payload = await getPayload({ config });

  const [catalogs, datasets] = await Promise.all([
    payload.find({
      collection: "catalogs",
      limit: 100,
    }),
    payload.find({
      collection: "datasets",
      limit: 1000,
      depth: 1,
    }),
  ]);

  return (
    <Suspense fallback={LOADING_ELEMENT}>
      <ListExplorer catalogs={catalogs.docs} datasets={datasets.docs} />
    </Suspense>
  );
}
