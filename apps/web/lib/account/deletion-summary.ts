/**
 * Counts of the data an account deletion would transfer or delete.
 *
 * Trashed documents are counted too: deletion removes them permanently.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { countUserDocs, findUserDocs } from "@/lib/utils/user-data";

import type { DeletionSummary } from "./deletion-types";

/** Count what deleting the user's account would transfer and delete. */
export const buildDeletionSummary = async (payload: Payload, userId: number): Promise<DeletionSummary> => {
  const isPublicFilter = [{ isPublic: { equals: true } }];
  const isPrivateFilter = [{ isPublic: { equals: false } }];

  // Count catalogs and datasets by visibility
  const [publicCatalogs, privateCatalogs, publicDatasets, privateDatasets] = await Promise.all([
    countUserDocs(payload, "catalogs", userId, { extraWhere: isPublicFilter, trash: true }),
    countUserDocs(payload, "catalogs", userId, { extraWhere: isPrivateFilter, trash: true }),
    countUserDocs(payload, "datasets", userId, { extraWhere: isPublicFilter, trash: true }),
    countUserDocs(payload, "datasets", userId, { extraWhere: isPrivateFilter, trash: true }),
  ]);

  // No limit: findUserDocs only disables pagination when no limit is given.
  const userDatasets = await findUserDocs(payload, "datasets", userId, { trash: true });

  const publicDatasetIds = userDatasets.filter((d) => d.isPublic).map((d) => d.id);
  const privateDatasetIds = userDatasets.filter((d) => !d.isPublic).map((d) => d.id);

  let eventsInPublic = 0;
  let eventsInPrivate = 0;

  if (publicDatasetIds.length > 0) {
    const publicEvents = await payload.count({
      collection: "events",
      where: { dataset: { in: publicDatasetIds } },
      overrideAccess: true,
      trash: true,
    });
    eventsInPublic = publicEvents.totalDocs;
  }

  if (privateDatasetIds.length > 0) {
    const privateEvents = await payload.count({
      collection: "events",
      where: { dataset: { in: privateDatasetIds } },
      overrideAccess: true,
      trash: true,
    });
    eventsInPrivate = privateEvents.totalDocs;
  }

  // Count other entities
  const [scheduledIngests, importFiles, media, views, dataExports, scraperRepos] = await Promise.all([
    countUserDocs(payload, "scheduled-ingests", userId, { trash: true }),
    countUserDocs(payload, "ingest-files", userId, { userField: "user", trash: true }),
    countUserDocs(payload, "media", userId, { trash: true }),
    countUserDocs(payload, "views", userId, { trash: true }),
    countUserDocs(payload, "data-exports", userId, { userField: "user", trash: true }),
    countUserDocs(payload, "scraper-repos", userId, { trash: true }),
  ]);

  return {
    catalogs: { public: publicCatalogs, private: privateCatalogs },
    datasets: { public: publicDatasets, private: privateDatasets },
    events: { inPublicDatasets: eventsInPublic, inPrivateDatasets: eventsInPrivate },
    scheduledIngests,
    importFiles,
    media,
    views,
    dataExports,
    scraperRepos,
  };
};
