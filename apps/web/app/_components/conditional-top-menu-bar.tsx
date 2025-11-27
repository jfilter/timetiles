/**
 * Server component wrapper for adaptive header.
 *
 * Fetches main menu data and user auth state from Payload CMS and renders
 * the adaptive header which shows marketing navigation or app controls
 * based on the current route.
 *
 * @module
 * @category Components
 */
import { headers as getHeaders } from "next/headers";
import { getPayload } from "payload";

import config from "@/payload.config";
import type { MainMenu, User } from "@/payload-types";

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

export const ConditionalTopMenuBar = async () => {
  const [mainMenu, user] = await Promise.all([getMainMenu(), getUser()]);

  return <AdaptiveHeader mainMenu={mainMenu} user={user} />;
};
