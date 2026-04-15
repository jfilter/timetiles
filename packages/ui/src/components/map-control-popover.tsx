/**
 * Floating panel for map controls.
 *
 * Opens a positioned panel next to a trigger element (typically a
 * MapControlButton). Handles open/close state internally or via props.
 *
 * The `trigger` prop is a render function that receives the `onClick`
 * toggle handler (and current `isOpen` state) so the caller can decide
 * which element gets the handler. This avoids wrapping the trigger in
 * another button (WCAG nested-interactive) and avoids cloneElement
 * (implicit prop injection).
 *
 * @module
 * @category Components
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";

export interface MapControlPopoverTriggerProps {
  onClick: () => void;
  isOpen: boolean;
}

export interface MapControlPopoverProps {
  /** Render function for the trigger element. Receives `onClick` and `isOpen`. */
  trigger: (props: MapControlPopoverTriggerProps) => React.ReactNode;
  /** Panel content (rendered when open). */
  children: React.ReactNode;
  /** Controlled open state. */
  open?: boolean;
  /** Called when open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** Panel width class. @default "w-56" */
  widthClass?: string;
  /** Additional class names for the panel. */
  panelClassName?: string;
}

export const MapControlPopover = ({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  widthClass = "w-56",
  panelClassName,
}: MapControlPopoverProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      setInternalOpen(value);
      onOpenChange?.(value);
    },
    [onOpenChange]
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setOpen]);

  const handleToggle = useCallback(() => setOpen(!isOpen), [setOpen, isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {trigger({ onClick: handleToggle, isOpen })}

      {isOpen && (
        <div
          className={cn(
            "absolute bottom-0 left-10 z-20 rounded border bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800",
            widthClass,
            panelClassName
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
};
