/**
 * Server component wrapper for adaptive header.
 *
 * Fetches main menu data, user auth state, catalogs, and datasets from
 * Payload CMS and renders the adaptive header which shows marketing
 * navigation or app controls based on the current route, or the header a
 * CMS page's layout template asks for.
 *
 * @module
 * @category Components
 */
import { headers as getHeaders } from "next/headers";
import { getLocale } from "next-intl/server";
import { getPayload } from "payload";

import type { Locale } from "@/i18n/config";
import type { LayoutSettings } from "@/lib/services/resolution/layout-resolver";
import config from "@/payload.config";
import type { Catalog, Dataset, MainMenu, User } from "@/payload-types";

import { AdaptiveHeader } from "./adaptive-header";

const getMainMenu = async (locale: Locale): Promise<MainMenu> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({ slug: "main-menu", locale });
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
    pagination: false,
    sort: "name",
    where: { isPublic: { equals: true } },
  });
  return result.docs;
};

const getDatasets = async (): Promise<Dataset[]> => {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "datasets",
    limit: 500,
    pagination: false,
    sort: "name",
    where: { isPublic: { equals: true } },
  });
  return result.docs;
};

interface ConditionalTopMenuBarProps {
  /** Layout template of a CMS page; `null`/omitted keeps the route-based header. */
  layout?: LayoutSettings | null;
}

export const ConditionalTopMenuBar = async ({ layout = null }: Readonly<ConditionalTopMenuBarProps>) => {
  const locale = (await getLocale()) as Locale;
  // Catalogs and datasets only feed the explore header, which templated pages never show.
  const [mainMenu, user, catalogs, datasets] = await Promise.all([
    getMainMenu(locale),
    getUser(),
    layout == null ? getCatalogs() : [],
    layout == null ? getDatasets() : [],
  ]);

  return <AdaptiveHeader mainMenu={mainMenu} user={user} catalogs={catalogs} datasets={datasets} layout={layout} />;
};
