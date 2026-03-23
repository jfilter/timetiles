/**
 * Context to signal that the current page is rendered in embed/iframe mode.
 *
 * Used by components like {@link ExplorerShell} to adjust viewport sizing
 * when no header chrome is present.
 *
 * @module
 * @category Context
 */
"use client";

import { createContext, useContext } from "react";

const EmbedContext = createContext(false);

export const EmbedProvider = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <EmbedContext value>{children}</EmbedContext>
);

export const useIsEmbed = () => useContext(EmbedContext);
