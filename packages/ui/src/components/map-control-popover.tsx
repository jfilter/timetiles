/**
 * Floating panel for map controls.
 *
 * Opens a positioned panel next to a trigger element (typically a
 * MapControlButton). Handles open/close state internally or via props.
 *
 * @module
 * @category Components
 */
import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";

export interface MapControlPopoverProps {
  /** Trigger element (rendered always). */
  trigger: React.ReactNode;
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

  // Clone the trigger to inject onClick instead of wrapping it in another
  // button — nested interactive controls violate WCAG (nested-interactive).
  const triggerWithHandler = isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, { onClick: () => setOpen(!isOpen) })
    : trigger;

  return (
    <div ref={containerRef} className="relative">
      {triggerWithHandler}

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
