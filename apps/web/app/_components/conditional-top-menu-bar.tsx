/**
 * Server component wrapper for adaptive header.
 *
 * Fetches main menu data from Payload CMS and renders the adaptive header
 * which automatically shows marketing navigation or app controls based on
 * the current route.
 *
 * @module
 * @category Components
 */
import { getPayload } from "payload";

import config from "@/payload.config";
import type { Catalog, Dataset, MainMenu } from "@/payload-types";

import { AdaptiveHeader } from "./adaptive-header";

const getMainMenu = async (): Promise<MainMenu> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({
    slug: "main-menu",
  });
};

const getCatalogsAndDatasets = async (): Promise<{ catalogs: Catalog[]; datasets: Dataset[] }> => {
  const payload = await getPayload({ config });
  const [catalogsResult, datasetsResult] = await Promise.all([
    payload.find({ collection: "catalogs", limit: 100 }),
    payload.find({ collection: "datasets", limit: 1000 }),
  ]);
  return {
    catalogs: catalogsResult.docs,
    datasets: datasetsResult.docs,
  };
};

export const ConditionalTopMenuBar = async () => {
  const [mainMenu, { catalogs, datasets }] = await Promise.all([getMainMenu(), getCatalogsAndDatasets()]);

  return <AdaptiveHeader mainMenu={mainMenu} catalogs={catalogs} datasets={datasets} />;
};
