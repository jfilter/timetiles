import { getPayload } from "payload";

import config from "../payload.config";
import type { MainMenu } from "../payload-types";
import { ClientConditionalTopMenuBar } from "./client-conditional-top-menu-bar";

const getMainMenu = async (): Promise<MainMenu> => {
  const payload = await getPayload({ config });
  return payload.findGlobal({
    slug: "main-menu",
  });
};

export const ConditionalTopMenuBar = async () => {
  const mainMenu = await getMainMenu();

  return <ClientConditionalTopMenuBar mainMenu={mainMenu} />;
};
