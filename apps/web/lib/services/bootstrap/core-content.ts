/**
 * Bootstrap default CMS content for deployments that do not run seed scripts.
 *
 * Local development and tests use the seed presets, but staging/production
 * deployments boot from an empty database. This module inserts only the
 * content required for a usable public site, and only when that content is
 * missing, so dashboard edits are never overwritten.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { FOOTER_SLUG, MAIN_MENU_SLUG, SETTINGS_SLUG } from "@/lib/seed/constants";
import { footerSeed, footerSeedDe } from "@/lib/seed/seeds/footer";
import { mainMenuSeed, mainMenuSeedDe } from "@/lib/seed/seeds/main-menu";
import { pagesSeed, pagesSeedDe } from "@/lib/seed/seeds/pages";
import { settingsSeed, settingsSeedDe } from "@/lib/seed/seeds/settings";
import { siteSeeds } from "@/lib/seed/seeds/sites";
import { viewSeeds } from "@/lib/seed/seeds/views";

const logger = createLogger("core-content-bootstrap");

type Locale = "en" | "de";
type GlobalSlug = typeof FOOTER_SLUG | typeof MAIN_MENU_SLUG | typeof SETTINGS_SLUG;
type SeedRecord = Record<string, unknown>;

const LOCALES = ["en", "de"] as const satisfies readonly Locale[];
const DEFAULT_SITE_SLUG = "default";

const localizedGlobalSeeds = {
  [FOOTER_SLUG]: { en: footerSeed, de: footerSeedDe },
  [MAIN_MENU_SLUG]: { en: mainMenuSeed, de: mainMenuSeedDe },
  [SETTINGS_SLUG]: { en: settingsSeed, de: settingsSeedDe },
} as const;

const hasItems = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

const isGlobalEmpty = (slug: GlobalSlug, doc: SeedRecord): boolean => {
  switch (slug) {
    case FOOTER_SLUG:
      return !doc.tagline && !hasItems(doc.socialLinks) && !hasItems(doc.columns);
    case MAIN_MENU_SLUG:
      return !hasItems(doc.navItems);
    case SETTINGS_SLUG:
      return !doc.legal || Object.values(doc.legal as SeedRecord).every((value) => value == null || value === "");
  }
};

const updateGlobal = async (payload: Payload, slug: GlobalSlug, locale: Locale, data: SeedRecord): Promise<void> => {
  await payload.updateGlobal({ slug, locale, data, overrideAccess: true });
};

const bootstrapGlobal = async (payload: Payload, slug: GlobalSlug): Promise<boolean> => {
  let updated = false;
  const seeds = localizedGlobalSeeds[slug];

  for (const locale of LOCALES) {
    const existing = (await payload.findGlobal({ slug, locale, overrideAccess: true })) as unknown as SeedRecord;
    if (isGlobalEmpty(slug, existing)) {
      await updateGlobal(payload, slug, locale, seeds[locale]);
      updated = true;
    }
  }

  return updated;
};

const findDefaultSite = async (payload: Payload) => {
  const bySlug = await payload.find({
    collection: "sites",
    where: { slug: { equals: DEFAULT_SITE_SLUG } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (bySlug.docs[0]) return bySlug.docs[0];

  const byFlag = await payload.find({
    collection: "sites",
    where: { isDefault: { equals: true } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return byFlag.docs[0] ?? null;
};

const ensureDefaultSite = async (payload: Payload) => {
  const existing = await findDefaultSite(payload);
  if (existing) return { site: existing, created: false };

  const seed = siteSeeds[0];
  if (!seed) {
    throw new Error("Default site seed is missing");
  }

  const site = await payload.create({ collection: "sites", data: seed, overrideAccess: true });
  return { site, created: true };
};

const mergeBlockIds = (createdBlocks: SeedRecord[], seedBlocks: SeedRecord[]): SeedRecord[] => {
  return seedBlocks.map((seedBlock, i) => {
    const created = createdBlocks[i];
    if (!created) return seedBlock;

    const merged: SeedRecord = { ...seedBlock, id: created.id };

    for (const key of Object.keys(seedBlock)) {
      const seedArr = seedBlock[key];
      const createdArr = created[key];
      if (Array.isArray(seedArr) && Array.isArray(createdArr)) {
        merged[key] = seedArr.map((item, j) => {
          const createdItem = createdArr[j] as SeedRecord | undefined;
          if (createdItem?.id && typeof item === "object" && item !== null) {
            return { ...item, id: createdItem.id };
          }
          return item;
        });
      }
    }

    return merged;
  });
};

const toSeedBlocks = (blocks: unknown): SeedRecord[] => (Array.isArray(blocks) ? (blocks as SeedRecord[]) : []);

const bootstrapPages = async (payload: Payload, siteId: number): Promise<number> => {
  let created = 0;

  for (const seed of pagesSeed) {
    const slug = seed.slug;
    if (!slug) continue;

    const existing = await payload.find({
      collection: "pages",
      where: { and: [{ slug: { equals: slug } }, { site: { equals: siteId } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) continue;

    const data = { ...seed, site: siteId, _status: "published" };
    const doc = await payload.create({ collection: "pages", data: data as never, locale: "en", overrideAccess: true });
    const createdPage = (await payload.findByID({
      collection: "pages",
      id: doc.id,
      depth: 0,
      locale: "en",
      overrideAccess: true,
    })) as unknown as SeedRecord;

    const createdBlocks = toSeedBlocks(createdPage.pageBuilder);
    const enBlocks = mergeBlockIds(createdBlocks, toSeedBlocks(seed.pageBuilder));
    await payload.update({
      collection: "pages",
      id: doc.id,
      data: { pageBuilder: enBlocks },
      locale: "en",
      overrideAccess: true,
    });

    const deSeed = pagesSeedDe[slug];
    if (deSeed) {
      const { site: _site, ...localizedDeSeed } = deSeed;
      const deBlocks = deSeed.pageBuilder ? mergeBlockIds(createdBlocks, toSeedBlocks(deSeed.pageBuilder)) : undefined;
      await payload.update({
        collection: "pages",
        id: doc.id,
        data: { ...localizedDeSeed, ...(deBlocks ? { pageBuilder: deBlocks } : {}) },
        locale: "de",
        overrideAccess: true,
      });
    }

    created += 1;
  }

  return created;
};

const bootstrapViews = async (payload: Payload, siteId: number): Promise<number> => {
  let created = 0;

  for (const seed of viewSeeds) {
    const existing = await payload.find({
      collection: "views",
      where: { and: [{ slug: { equals: seed.slug } }, { site: { equals: siteId } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) continue;

    await payload.create({ collection: "views", data: { ...seed, site: siteId }, overrideAccess: true });
    created += 1;
  }

  return created;
};

/**
 * Ensure deployment databases have enough CMS content for a usable public site.
 */
export const bootstrapDefaultCoreContent = async (payload: Payload): Promise<void> => {
  const { site, created: siteCreated } = await ensureDefaultSite(payload);
  const siteId = Number(site.id);

  const [createdPages, createdViews, footerUpdated, menuUpdated, settingsUpdated] = await Promise.all([
    bootstrapPages(payload, siteId),
    bootstrapViews(payload, siteId),
    bootstrapGlobal(payload, FOOTER_SLUG),
    bootstrapGlobal(payload, MAIN_MENU_SLUG),
    bootstrapGlobal(payload, SETTINGS_SLUG),
  ]);

  if (siteCreated || createdPages > 0 || createdViews > 0 || footerUpdated || menuUpdated || settingsUpdated) {
    logger.info(
      { siteCreated, createdPages, createdViews, footerUpdated, menuUpdated, settingsUpdated },
      "Bootstrapped default core CMS content"
    );
  }
};
