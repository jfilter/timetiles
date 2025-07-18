import { getPayload } from "payload";
import config from "../payload.config";
import { MainMenu } from "../payload-types";
import { ClientConditionalTopMenuBar } from "./ClientConditionalTopMenuBar";

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
