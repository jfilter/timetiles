/**
 * Shared grid background style definitions for cartographic-themed components.
 *
 * Provides parameterized CSS style objects for consistent grid overlays
 * across header, hero, and other decorative UI sections.
 *
 * @module
 * @category Styles
 */

import type { CSSProperties } from "react";

interface GridBackgroundOptions {
  /** CSS color value or custom property for the grid lines. */
  color: string;
  /** Size of the primary grid cells in pixels. */
  cellSize: number;
  /** Line width of the primary grid in pixels. Defaults to 1. */
  lineWidth?: number;
  /** Optional secondary (finer) grid with smaller cell size. */
  secondaryGrid?: { cellSize: number; lineWidth: number };
}

/**
 * Creates a CSS style object for a repeating grid background pattern.
 *
 * Produces a cross-hatch of horizontal and vertical lines using CSS
 * `linear-gradient`. Optionally includes a secondary finer grid overlay.
 */
export const createGridBackgroundStyle = (options: GridBackgroundOptions): CSSProperties => {
  const { color, cellSize, lineWidth = 1, secondaryGrid } = options;
  const size = `${cellSize}px ${cellSize}px`;
  const lw = `${lineWidth}px`;

  if (secondaryGrid) {
    const secSize = `${secondaryGrid.cellSize}px ${secondaryGrid.cellSize}px`;
    const secLw = `${secondaryGrid.lineWidth}px`;

    return {
      backgroundImage: `
        linear-gradient(${color} ${lw}, transparent ${lw}),
        linear-gradient(90deg, ${color} ${lw}, transparent ${lw}),
        linear-gradient(${color} ${secLw}, transparent ${secLw}),
        linear-gradient(90deg, ${color} ${secLw}, transparent ${secLw})
      `,
      backgroundSize: `${size}, ${size}, ${secSize}, ${secSize}`,
    };
  }

  return {
    backgroundImage: `
      linear-gradient(to right, ${color} ${lw}, transparent ${lw}),
      linear-gradient(to bottom, ${color} ${lw}, transparent ${lw})
    `,
    backgroundSize: size,
  };
};

/**
 * Cartographic grid for the Header component.
 *
 * Uses the `--cartographic-navy` custom property with 40px cells.
 * Intended to be rendered inside a container with low opacity.
 */
export const headerGridStyle: CSSProperties = {
  ...createGridBackgroundStyle({ color: "var(--cartographic-navy)", cellSize: 40 }),
  opacity: "0.1",
};

/**
 * Cartographic grid for the Hero component.
 *
 * Uses the `--color-foreground` custom property with 60px primary cells
 * and a 20px secondary grid for a detailed topographic appearance.
 */
export const heroGridStyle: CSSProperties = createGridBackgroundStyle({
  color: "var(--color-foreground)",
  cellSize: 60,
  lineWidth: 1,
  secondaryGrid: { cellSize: 20, lineWidth: 0.5 },
});
