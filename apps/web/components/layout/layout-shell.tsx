/**
 * Layout shell component for template-driven page structure.
 *
 * Resolves the active layout template (page override > site default > platform default)
 * and renders the appropriate header/footer/content structure.
 *
 * @module
 * @category Components
 */

export interface LayoutTemplateConfig {
  headerVariant: "marketing" | "app" | "minimal" | "none";
  footerVariant: "full" | "compact" | "none";
  contentMaxWidth: "sm" | "md" | "lg" | "xl" | "full";
  stickyHeader: boolean;
}

/** Platform defaults when no layout template is assigned. */
export const DEFAULT_LAYOUT: LayoutTemplateConfig = {
  headerVariant: "marketing",
  footerVariant: "full",
  contentMaxWidth: "lg",
  stickyHeader: true,
};

const MAX_WIDTH_MAP: Record<string, string> = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-full",
};

/**
 * Resolves a layout template configuration from raw Payload data.
 * Falls back to platform defaults for missing fields.
 */
export const resolveLayoutTemplate = (raw: Record<string, unknown> | null | undefined): LayoutTemplateConfig => {
  if (!raw) return DEFAULT_LAYOUT;
  return {
    headerVariant: (raw.headerVariant as LayoutTemplateConfig["headerVariant"]) ?? DEFAULT_LAYOUT.headerVariant,
    footerVariant: (raw.footerVariant as LayoutTemplateConfig["footerVariant"]) ?? DEFAULT_LAYOUT.footerVariant,
    contentMaxWidth: (raw.contentMaxWidth as LayoutTemplateConfig["contentMaxWidth"]) ?? DEFAULT_LAYOUT.contentMaxWidth,
    stickyHeader: typeof raw.stickyHeader === "boolean" ? raw.stickyHeader : DEFAULT_LAYOUT.stickyHeader,
  };
};

/**
 * Get the Tailwind max-width class for a layout template.
 */
export const getContentMaxWidthClass = (maxWidth: LayoutTemplateConfig["contentMaxWidth"]): string => {
  return MAX_WIDTH_MAP[maxWidth] ?? "max-w-6xl";
};

/**
 * Check if header should be shown for a given layout template.
 */
export const shouldShowHeader = (layout: LayoutTemplateConfig): boolean => {
  return layout.headerVariant !== "none";
};

/**
 * Check if footer should be shown for a given layout template.
 */
export const shouldShowFooter = (layout: LayoutTemplateConfig): boolean => {
  return layout.footerVariant !== "none";
};
