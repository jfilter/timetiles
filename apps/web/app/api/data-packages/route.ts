/**
 * List available data packages with activation status.
 *
 * @module
 */
import { apiRoute } from "@/lib/api";
import { getActivationStatus } from "@/lib/data-packages/activation-service";
import { loadAllManifests } from "@/lib/data-packages/manifest-loader";
import type { DataPackageListItem } from "@/lib/types/data-packages";

export const GET = apiRoute({
  auth: "optional",
  handler: async ({ user, payload }) => {
    const manifests = loadAllManifests();
    const slugs = manifests.map((m) => m.slug);

    // Only fetch activation status for authenticated users
    const statusMap = user ? await getActivationStatus(payload, slugs) : new Map();

    const packages: DataPackageListItem[] = manifests.map((manifest) => {
      const activation = statusMap.get(manifest.slug);
      return {
        ...manifest,
        // Strip auth secrets from response
        source: { ...manifest.source, auth: manifest.source.auth ? { type: manifest.source.auth.type } : undefined },
        activated: !!activation,
        activation,
      };
    });

    return { packages };
  },
});
