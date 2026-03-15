/**
 * Navigation configuration context for the import wizard.
 *
 * Extracted from WizardContext to reduce the god-object surface area.
 * Steps can customize navigation buttons (labels, handlers, visibility)
 * without coupling to the full wizard state.
 *
 * @module
 * @category Components
 */
"use client";

import { createContext, useContext, useState } from "react";

/**
 * Configuration for the wizard navigation buttons.
 * Steps can customize their navigation behavior via context.
 */
export interface NavigationConfig {
  /** Custom handler for the next button */
  onNext?: () => void | Promise<void>;
  /** Custom label for the next button */
  nextLabel?: string;
  /** Whether the next action is loading */
  isLoading?: boolean;
  /** Whether to show the back button (default: true) */
  showBack?: boolean;
  /** Whether to show the next button (default: true) */
  showNext?: boolean;
}

const defaultNavigationConfig: NavigationConfig = { showBack: true, showNext: true };

interface NavigationConfigContextValue {
  navigationConfig: NavigationConfig;
  setNavigationConfig: (config: NavigationConfig) => void;
}

const NavigationConfigContext = createContext<NavigationConfigContextValue | null>(null);

export const NavigationConfigProvider = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  const [navigationConfig, setNavigationConfigState] = useState<NavigationConfig>(defaultNavigationConfig);

  const setNavigationConfig = (config: NavigationConfig) => {
    setNavigationConfigState({ ...defaultNavigationConfig, ...config });
  };

  const value = { navigationConfig, setNavigationConfig };

  return <NavigationConfigContext.Provider value={value}>{children}</NavigationConfigContext.Provider>;
};

export const useNavigationConfig = () => {
  const context = useContext(NavigationConfigContext);
  if (!context) {
    throw new Error("useNavigationConfig must be used within a NavigationConfigProvider");
  }
  return context;
};
