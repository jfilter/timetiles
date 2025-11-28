/**
 * Mobile filter bottom sheet component.
 *
 * Provides a swipe-up drawer pattern for filters on mobile devices.
 * Takes ~70% of screen height with drag handle and smooth animations.
 * Much more thumb-friendly than full-screen overlay.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { Filter, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  children: ReactNode;
  activeFilterCount?: number;
}

export const MobileFilterSheet = ({
  isOpen,
  onClose,
  onOpen,
  children,
  activeFilterCount = 0,
}: MobileFilterSheetProps) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      startY.current = touch.clientY;
      currentY.current = touch.clientY;
      setIsDragging(true);
    }
  }, []);

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      if (touch) {
        currentY.current = touch.clientY;
        const delta = currentY.current - startY.current;
        // Only allow dragging down (positive delta)
        if (delta > 0) {
          setDragOffset(delta);
        }
      }
    },
    [isDragging]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    // If dragged more than 100px down, close the sheet
    if (dragOffset > 100) {
      onClose();
    }
    setDragOffset(0);
  }, [dragOffset, onClose]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Memoize the sheet style to avoid creating new objects on each render
  const sheetStyle = useMemo(
    () => ({
      height: "70dvh",
      transform: isOpen ? `translateY(${dragOffset}px)` : "translateY(100%)",
    }),
    [isOpen, dragOffset]
  );

  return (
    <>
      {/* Floating Action Button */}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 md:hidden",
          "bg-cartographic-navy hover:bg-cartographic-navy/90 text-white",
          "dark:bg-cartographic-cream dark:text-cartographic-charcoal dark:hover:bg-cartographic-cream/90",
          isOpen && "pointer-events-none scale-0 opacity-0"
        )}
        aria-label="Open filters"
      >
        <Filter className="h-6 w-6" />
        {activeFilterCount > 0 && (
          <span className="bg-cartographic-terracotta absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "bg-background fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out md:hidden",
          isOpen ? "translate-y-0" : "translate-y-full",
          isDragging && "transition-none"
        )}
        style={sheetStyle}
      >
        {/* Drag Handle */}
        <div
          className="flex cursor-grab touch-none flex-col items-center pt-3 active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="bg-cartographic-navy/20 dark:bg-cartographic-cream/30 h-1 w-10 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 pb-3 pt-2">
          <h2 className="text-cartographic-charcoal dark:text-cartographic-cream font-serif text-lg font-semibold">
            Filters
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-cartographic-navy/70 hover:bg-cartographic-navy/10 hover:text-cartographic-navy dark:text-cartographic-cream/70 dark:hover:bg-cartographic-cream/10 dark:hover:text-cartographic-cream rounded-sm p-2 transition-colors"
            aria-label="Close filters"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-4rem)] overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </>
  );
};
