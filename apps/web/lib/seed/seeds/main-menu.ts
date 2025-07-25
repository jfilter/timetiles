import type { MainMenu } from "@/payload-types";

export const mainMenuSeed: Partial<MainMenu> = {
  navItems: [
    {
      label: "Home",
      url: "/",
    },
    {
      label: "Explore",
      url: "/explore",
    },
    {
      label: "Import",
      url: "/import",
    },
    {
      label: "About",
      url: "/about",
    },
    {
      label: "Contact",
      url: "/contact",
    },
  ],
};
