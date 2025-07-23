"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { MainMenu } from "../payload-types";
import { TopMenuBar } from "./top-menu-bar";

interface ClientConditionalTopMenuBarProps {
  mainMenu: MainMenu;
}

export function ClientConditionalTopMenuBar({
  mainMenu,
}: ClientConditionalTopMenuBarProps) {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  const isExplorePage = pathname === "/explore";

  useEffect(() => {
    if (isExplorePage) {
      // Start fade out
      setIsVisible(false);
      // Remove from DOM after animation
      const timeout = setTimeout(() => {
        setShouldRender(false);
      }, 300); // Match the transition duration
      return () => clearTimeout(timeout);
    } else {
      // Add to DOM first
      setShouldRender(true);
      // Then fade in
      const timeout = setTimeout(() => {
        setIsVisible(true);
      }, 10); // Small delay to ensure DOM update
      return () => clearTimeout(timeout);
    }
  }, [isExplorePage]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      className={`transition-opacity duration-300 ease-in-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <TopMenuBar mainMenu={mainMenu} />
    </div>
  );
}
