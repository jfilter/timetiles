/**
 * Shared map overlay components for loading and error states.
 *
 * Provides consistent overlay styling for map components with
 * backdrop blur and centered content.
 *
 * @module
 * @category Components
 */
import { ContentState, LoadingState } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import type { ReactNode } from "react";

/** Shared backdrop wrapper for map overlays */
export const MapOverlay = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cn(
      "bg-background/60 pointer-events-auto absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm",
      className
    )}
  >
    {children}
  </div>
);

/** Error overlay shown when map data fails to load */
export const MapErrorOverlay = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <MapOverlay>
    <ContentState variant="error" title={title} subtitle={subtitle} />
  </MapOverlay>
);

/** Loading overlay shown while computing initial bounds (opaque to hide map underneath) */
export const MapLoadingOverlay = ({ message }: { message: string }) => (
  <MapOverlay className="bg-background">
    <LoadingState variant="spinner" message={message} />
  </MapOverlay>
);
