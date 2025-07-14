import { getPayloadHMR } from "@payloadcms/next/utilities";
import { MapExplorer } from "@/components/MapExplorer";
import { Suspense } from "react";

import config from '../../../payload.config';

export default async function ExplorePage() {
  const payload = await getPayloadHMR({ config });
  
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
      <MapExplorer
        catalogs={catalogs.docs}
        datasets={datasets.docs}
      />
    </Suspense>
  );
}