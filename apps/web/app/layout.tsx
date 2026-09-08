/**
 * Root layout that delegates rendering to route group layouts.
 *
 * This minimal layout exists because Next.js requires a root layout,
 * but the actual HTML structure is provided by route group layouts:
 * - (frontend)/layout.tsx - Full layout with providers, footer, etc.
 * - (payload)/layout.tsx - Payload CMS admin layout
 *
 * @module
 */
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
