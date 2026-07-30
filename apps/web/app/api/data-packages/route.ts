/**
 * List available data packages with activation status.
 *
 * @module
 */
import { apiRoute } from "@/lib/api";
import { getActivationStatus } from "@/lib/data-packages/activation-service";
import { loadAllManifests } from "@/lib/data-packages/manifest-loader";
import type { DataPackageListItem } from "@/lib/data-packages/types";

export const GET = apiRoute({
  auth: "optional",
  handler: async ({ user, payload }) => {
    const manifests = loadAllManifests();
    const slugs = manifests.map((m) => m.slug);

    // Only fetch activation status for authenticated users
    const statusMap = user ? await getActivationStatus(payload, slugs, user.id) : new Map();

    const packages: DataPackageListItem[] = manifests.map((manifest) => {
      const activation = statusMap.get(manifest.slug);
      return {
        ...manifest,
        // Strip auth secrets from response
        source: { ...manifest.source, auth: manifest.source.auth ? { type: manifest.source.auth.type } : undefined },
        // `enabled` matters: a deactivated package kept reporting "Activated", so the UI
        // only ever offered Deactivate and there was no way back on.
        activated: activation?.enabled === true,
        activation,
      };
    });

    return { packages };
  },
});
