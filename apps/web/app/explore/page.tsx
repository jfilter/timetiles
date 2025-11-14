/**
 * This file defines the main data exploration page of the application.
 *
 * It is responsible for fetching the initial data required for the `MapExplorer`
 * component, specifically the list of all available catalogs and datasets. This data
 * is then passed as props to the `MapExplorer`, which handles the interactive
 * visualization and filtering of the event data.
 * @module
 */
import { getPayload } from "payload";
import { Suspense } from "react";

import { MapExplorer } from "@/app/explore/_components/map-explorer";
import config from "@/payload.config";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

const LOADING_ELEMENT = <div>Loading explorer...</div>;

export default async function ExplorePage() {
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
      <MapExplorer catalogs={catalogs.docs} datasets={datasets.docs} />
    </Suspense>
  );
}
