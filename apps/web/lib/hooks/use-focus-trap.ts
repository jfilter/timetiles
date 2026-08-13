/**
 * Focus management for a hand-rolled modal surface.
 *
 * Moves focus into the container when it opens, keeps Tab inside it while open,
 * and returns focus to whatever was focused before. Components built on the Radix
 * dialog primitives get this for free — this is for the surfaces that cannot use
 * them, currently the draggable mobile filter sheet.
 *
 * @module
 * @category Hooks
 */
"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";

/** Tabbable elements, minus the ones a `tabindex="-1"` or `disabled` takes out. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Skip what cannot take focus: anything inside an `inert` or `hidden` subtree, plus
 * whatever the browser considers invisible. `offsetParent`-based visibility checks are
 * wrong here — the sheet is `position: fixed` — and absent in jsdom, hence
 * `checkVisibility` with a plain fallback.
 */
const focusableWithin = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.closest("[inert],[hidden]") != null) return false;
    return typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
  });

export const useFocusTrap = (containerRef: RefObject<HTMLElement | null>, isActive: boolean): void => {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // The first control rather than the container: a sheet that opens with focus on
    // its own wrapper reads as an empty region in most screen readers.
    const initial = focusableWithin(container)[0] ?? container;
    initial.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = focusableWithin(container);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        // Nothing to move to — keep focus on the container instead of letting it escape.
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Only restore if focus is still inside the closing surface; the user may have
      // clicked elsewhere in the meantime and stealing it back would be worse.
      if (container.contains(document.activeElement)) {
        previouslyFocused.current?.focus();
      }
    };
  }, [containerRef, isActive]);
};
