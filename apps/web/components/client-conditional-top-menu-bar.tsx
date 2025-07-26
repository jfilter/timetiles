"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { MainMenu } from "../payload-types";
import { TopMenuBar } from "./top-menu-bar";

interface ClientConditionalTopMenuBarProps {
  mainMenu: MainMenu;
}

export const ClientConditionalTopMenuBar = ({ mainMenu }: Readonly<ClientConditionalTopMenuBarProps>) => {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  const isExplorePage = pathname === "/explore";

  useEffect(() => {
    const handlePageVisibility = () => {
      if (isExplorePage) {
        // Start fade out
        const hideMenu = () => setIsVisible(false);
        const removeFromDOM = () => setShouldRender(false);

        hideMenu();
        // Remove from DOM after animation
        const timeout = setTimeout(removeFromDOM, 300); // Match the transition duration
        return () => clearTimeout(timeout);
      } else {
        // Add to DOM first
        const addToDOM = () => setShouldRender(true);
        const showMenu = () => setIsVisible(true);

        addToDOM();
        // Then fade in
        const timeout = setTimeout(showMenu, 10); // Small delay to ensure DOM update
        return () => clearTimeout(timeout);
      }
    };

    return handlePageVisibility();
  }, [isExplorePage]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className={`transition-opacity duration-300 ease-in-out ${isVisible ? "opacity-100" : "opacity-0"}`}>
      <TopMenuBar mainMenu={mainMenu} />
    </div>
  );
};
