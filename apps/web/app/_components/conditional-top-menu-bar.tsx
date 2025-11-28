/**
 * Server component wrapper for adaptive header.
 *
 * Fetches main menu data, user auth state, catalogs, and datasets from
 * Payload CMS and renders the adaptive header which shows marketing
 * navigation or app controls based on the current route.
 *
 * @module
 * @category Components
 */
import { headers as getHeaders } from "next/headers";
import { getPayload } from "payload";

import config from "@/payload.config";
import type { Catalog, Dataset, MainMenu, User } from "@/payload-types";

import { AdaptiveHeader } from "./adaptive-header";

const getMainMenu = async (): Promise<MainMenu> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({
    slug: "main-menu",
  });
};

const getUser = async (): Promise<User | null> => {
  const payload = await getPayload({ config });
  const headers = await getHeaders();
  const { user } = await payload.auth({ headers });
  return user;
};

const getCatalogs = async (): Promise<Catalog[]> => {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "catalogs",
    limit: 100,
    sort: "name",
  });
  return result.docs;
};

const getDatasets = async (): Promise<Dataset[]> => {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "datasets",
    limit: 500,
    sort: "name",
  });
  return result.docs;
};

export const ConditionalTopMenuBar = async () => {
  const [mainMenu, user, catalogs, datasets] = await Promise.all([
    getMainMenu(),
    getUser(),
    getCatalogs(),
    getDatasets(),
  ]);

  return <AdaptiveHeader mainMenu={mainMenu} user={user} catalogs={catalogs} datasets={datasets} />;
};
