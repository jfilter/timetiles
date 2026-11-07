/**
 * Resolves the layout template that frames a CMS page.
 *
 * Priority: page `layoutOverride` > site `defaultLayout` > platform default
 * (`null`). Candidates are re-read with the caller's access, so templates the
 * viewer may not read (e.g. unpublished drafts for anonymous visitors) are skipped.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import type { LayoutTemplate, User } from "@/payload-types";

/** A relationship value as Payload returns it: an ID or the populated document. */
export type LayoutTemplateRef = number | LayoutTemplate | null | undefined;

/** Fully specified layout settings, with the collection's field defaults applied. */
export interface LayoutSettings {
  headerVariant: NonNullable<LayoutTemplate["headerVariant"]>;
  stickyHeader: boolean;
  footerVariant: NonNullable<LayoutTemplate["footerVariant"]>;
  contentMaxWidth: NonNullable<LayoutTemplate["contentMaxWidth"]>;
}

interface ResolveLayoutOptions {
  pageOverride?: LayoutTemplateRef;
  siteDefault?: LayoutTemplateRef;
  /** Viewer whose read access decides which templates are visible. */
  user: User | null;
  /** Read the latest draft versions (Next Draft Mode previews). */
  draft?: boolean;
}

const refId = (ref: LayoutTemplateRef): number | null => (typeof ref === "object" ? (ref?.id ?? null) : (ref ?? null));

/** Applies the collection's field defaults to a stored template. */
export const toLayoutSettings = (template: LayoutTemplate): LayoutSettings => ({
  headerVariant: template.headerVariant ?? "marketing",
  stickyHeader: template.stickyHeader ?? true,
  footerVariant: template.footerVariant ?? "full",
  contentMaxWidth: template.contentMaxWidth ?? "lg",
});

/**
 * Returns the settings of the first readable template in priority order, or
 * `null` when the platform default applies.
 */
export const resolveLayoutTemplate = async (
  payload: Payload,
  { pageOverride, siteDefault, user, draft = false }: ResolveLayoutOptions
): Promise<LayoutSettings | null> => {
  const candidates = [refId(pageOverride), refId(siteDefault)].filter((id): id is number => id != null);
  if (candidates.length === 0) return null;

  const { docs } = await payload.find({
    collection: "layout-templates",
    where: { id: { in: candidates } },
    overrideAccess: false,
    user,
    draft,
    depth: 0,
    pagination: false,
  });

  for (const id of candidates) {
    const template = docs.find((doc) => doc.id === id);
    if (template) return toLayoutSettings(template);
  }
  return null;
};
