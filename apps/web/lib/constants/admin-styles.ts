/**
 * Shared style primitives for Payload admin panel components.
 *
 * Tailwind is not available in the Payload admin context, so these
 * components use inline styles. This module provides theme-aware
 * primitives using Payload's CSS custom properties, which automatically
 * adapt to light/dark mode.
 *
 * @module
 * @category Constants
 */

/** Payload theme-aware colors for admin panel components. */
export const adminColors = {
  /** Page/card background */
  bg: "var(--theme-elevation-0)",
  /** Subtle background (cards on top of bg) */
  bgSubtle: "var(--theme-elevation-50)",
  /** Border color */
  border: "var(--theme-elevation-100)",
  /** Primary text */
  text: "var(--theme-elevation-800)",
  /** Secondary/muted text */
  textMuted: "var(--theme-elevation-500)",
  /** Tertiary text */
  textSubtle: "var(--theme-elevation-400)",
  /** Interactive text (links, back buttons) */
  textInteractive: "var(--theme-elevation-600)",
} as const;

/** Reusable style fragments for admin panel components. */
export const adminStyles = {
  /** Standard card container */
  card: {
    background: adminColors.bgSubtle,
    border: `1px solid ${adminColors.border}`,
    borderRadius: "8px",
    padding: "20px",
  },
  /** Inset card (card within a card) */
  cardInset: {
    background: adminColors.bg,
    border: `1px solid ${adminColors.border}`,
    borderRadius: "6px",
    padding: "12px",
  },
  /** Standard text input */
  input: {
    flex: 1,
    padding: "8px 12px",
    border: `1px solid ${adminColors.border}`,
    borderRadius: "6px",
    fontSize: "14px",
    background: adminColors.bg,
    color: adminColors.text,
  },
} as const;
