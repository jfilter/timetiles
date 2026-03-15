/**
 * Map theme toggle control component.
 *
 * A compact button styled to match standard map controls that toggles
 * between light and dark themes. Positioned in the map control area.
 *
 * @module
 * @category Components
 */

import { ThemeToggle } from "@/app/_components/theme-toggle";

export const MapThemeControl = () => (
  <ThemeToggle
    className="flex h-[29px] w-[29px] items-center justify-center rounded bg-white shadow-md transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
    iconClassName="h-4 w-4 text-gray-600 dark:text-gray-300"
  />
);
