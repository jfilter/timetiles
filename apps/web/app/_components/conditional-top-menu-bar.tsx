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
import type { MainMenu } from "@/payload-types";

import { AdaptiveHeader } from "./adaptive-header";

const getMainMenu = async (): Promise<MainMenu> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({
    slug: "main-menu",
  });
};

export const ConditionalTopMenuBar = async () => {
  const mainMenu = await getMainMenu();

  return <AdaptiveHeader mainMenu={mainMenu} />;
};
