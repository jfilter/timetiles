/**
 * This file contains the seed data for the Main Menu global.
 *
 * It defines the default set of navigation items that will be populated in the main menu
 * when the database is seeded. This ensures that the application has a consistent and
 * functional navigation structure from the start, which is particularly useful for
 * development and testing environments.
 *
 * @module
 */
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
