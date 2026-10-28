/**
 * CSS breakpoint constants matching Tailwind's default breakpoints.
 *
 * Use these with {@link useMediaQuery} to keep JS-based responsive
 * logic in sync with Tailwind's CSS breakpoints.
 *
 * @module
 * @category Constants
 */

/** Width in px where Tailwind's `md` breakpoint starts. */
export const BREAKPOINT_MD_PX = 768;

/** Tailwind `md` breakpoint — tablet and above. */
export const BREAKPOINT_MD = `(min-width: ${BREAKPOINT_MD_PX}px)`;
