import { getPayload } from "payload";
import { Suspense } from "react";

import { MapExplorer } from "@/components/map-explorer";
import config from "@/payload.config";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

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
    <Suspense fallback={<div>Loading explorer...</div>}>
      <MapExplorer catalogs={catalogs.docs} datasets={datasets.docs} />
    </Suspense>
  );
}
