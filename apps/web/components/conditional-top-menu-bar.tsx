import { getPayload } from "payload";

import type { MainMenu } from "../payload-types";
import config from "../payload.config";
import { ClientConditionalTopMenuBar } from "./client-conditional-top-menu-bar";

async function getMainMenu(): Promise<MainMenu> {
  const payload = await getPayload({ config });
  const mainMenu = await payload.findGlobal({
    slug: "main-menu",
  });
  return mainMenu;
}

export async function ConditionalTopMenuBar() {
  const mainMenu = await getMainMenu();

  return <ClientConditionalTopMenuBar mainMenu={mainMenu} />;
}
