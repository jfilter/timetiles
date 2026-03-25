#!/usr/bin/env node
/**
 * Sets up a minimal but functional TimeTiles site.
 *
 * Creates a default site, navigation, footer, branding, settings,
 * and a home page so the instance works out of the box instead of
 * showing "Site not configured".
 *
 * Usage:
 *   pnpm setup-site              # Create site + navigation + pages
 *   pnpm setup-site --clean      # Remove setup data
 *
 * @module
 * @category Scripts
 */

import { getPayload } from "payload";

import { buildConfigWithDefaults } from "@/lib/config/payload-config-factory";
import { createLogger, logError } from "@/lib/logger";

const logger = createLogger("setup-site");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SITE_NAME = "TimeTiles";
const SITE_SLUG = "default";
const SITE_DESCRIPTION = "Making spatial and temporal data analysis accessible to everyone.";

// ---------------------------------------------------------------------------
// Site setup
// ---------------------------------------------------------------------------

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>;

const findOrCreateSite = async (payload: PayloadInstance) => {
  const { docs } = await payload.find({
    collection: "sites",
    where: { slug: { equals: SITE_SLUG } },
    limit: 1,
    overrideAccess: true,
  });

  if (docs.length > 0) {
    logger.info("Site already exists: %s", docs[0]!.name);
    return docs[0]!;
  }

  const site = await payload.create({
    collection: "sites",
    data: {
      name: SITE_NAME,
      slug: SITE_SLUG,
      isDefault: true,
      isPublic: true,
      _status: "published",
      branding: { title: SITE_NAME },
    },
    overrideAccess: true,
  });

  logger.info("Created site: %s (id=%d)", site.name, site.id);
  return site;
};

const setupBranding = async (payload: PayloadInstance) => {
  await payload.updateGlobal({ slug: "branding", data: { siteName: SITE_NAME, siteDescription: SITE_DESCRIPTION } });
  logger.info("Branding configured");
};

const setupMainMenu = async (payload: PayloadInstance) => {
  await payload.updateGlobal({
    slug: "main-menu",
    data: {
      navItems: [
        { label: "Home", url: "/" },
        { label: "Explore", url: "/explore" },
        { label: "About", url: "/about" },
      ],
    },
  });
  logger.info("Main menu configured");
};

const setupFooter = async (payload: PayloadInstance) => {
  await payload.updateGlobal({
    slug: "footer",
    data: {
      tagline: SITE_DESCRIPTION,
      socialLinks: [{ platform: "github", url: "https://github.com/jfilter/timetiles" }],
      columns: [
        {
          title: "Project",
          links: [
            { label: "About", url: "/about" },
            { label: "GitHub", url: "https://github.com/jfilter/timetiles" },
          ],
        },
        {
          title: "Legal",
          links: [
            { label: "Privacy", url: "/privacy" },
            { label: "Terms", url: "/terms" },
          ],
        },
      ],
      newsletter: {
        enabled: false,
        headline: "Stay Updated",
        placeholder: "your@email.address",
        buttonText: "Subscribe",
      },
      copyright: `\u00A9 ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.`,
      credits: "Built with TimeTiles",
    },
  });
  logger.info("Footer configured");
};

const setupSettings = async (payload: PayloadInstance) => {
  await payload.updateGlobal({
    slug: "settings",
    data: {
      legal: { termsUrl: "/terms", privacyUrl: "/privacy" },
      featureFlags: {
        enableRegistration: true,
        enableEventCreation: true,
        enableDatasetCreation: true,
        enableImportCreation: true,
        enableScheduledIngests: true,
        enableScheduledJobExecution: true,
        enableUrlFetchCaching: true,
        allowPrivateImports: true,
        enableScrapers: false,
      },
    },
  });
  logger.info("Settings configured");
};

const findOrCreateHomePage = async (payload: PayloadInstance, siteId: number) => {
  const { docs } = await payload.find({
    collection: "pages",
    where: { and: [{ slug: { equals: "home" } }, { site: { equals: siteId } }] },
    limit: 1,
    overrideAccess: true,
  });

  if (docs.length > 0) {
    logger.info("Home page already exists");
    return docs[0]!;
  }

  const page = await payload.create({
    collection: "pages",
    data: {
      title: "Home",
      slug: "home",
      site: siteId,
      _status: "published",
      pageBuilder: [
        {
          blockType: "hero",
          title: `Welcome to ${SITE_NAME}`,
          subtitle: SITE_DESCRIPTION,
          background: "grid",
          buttons: [
            { text: "Explore the Map", link: "/explore", variant: "default" },
            { text: "Learn More", link: "/about", variant: "outline" },
          ],
        },
      ],
    },
    overrideAccess: true,
  });

  logger.info("Created home page (id=%d)", page.id);
  return page;
};

const findOrCreateAboutPage = async (payload: PayloadInstance, siteId: number) => {
  const { docs } = await payload.find({
    collection: "pages",
    where: { and: [{ slug: { equals: "about" } }, { site: { equals: siteId } }] },
    limit: 1,
    overrideAccess: true,
  });

  if (docs.length > 0) {
    logger.info("About page already exists");
    return docs[0]!;
  }

  const page = await payload.create({
    collection: "pages",
    data: {
      title: "About",
      slug: "about",
      site: siteId,
      _status: "published",
      pageBuilder: [
        {
          blockType: "hero",
          title: `About ${SITE_NAME}`,
          subtitle: "An open source platform for exploring geospatial event data",
          background: "gradient",
        },
        {
          blockType: "features",
          headline: "What is TimeTiles?",
          features: [
            {
              title: "Import Data",
              description: "Import events from CSV, Excel, or scheduled URLs with automatic schema detection.",
            },
            {
              title: "Explore on Maps",
              description: "Visualize events on interactive maps with clustering and spatial filtering.",
            },
            {
              title: "Filter by Time",
              description: "Use temporal histograms and date ranges to find exactly what you need.",
            },
          ],
        },
      ],
    },
    overrideAccess: true,
  });

  logger.info("Created about page (id=%d)", page.id);
  return page;
};

// ---------------------------------------------------------------------------
// Clean
// ---------------------------------------------------------------------------

const cleanSiteData = async (payload: PayloadInstance) => {
  // Delete pages for default site
  const { docs: sites } = await payload.find({
    collection: "sites",
    where: { slug: { equals: SITE_SLUG } },
    limit: 1,
    overrideAccess: true,
  });

  if (sites.length > 0) {
    const siteId = sites[0]!.id;
    await payload.delete({ collection: "pages", where: { site: { equals: siteId } }, overrideAccess: true });
    await payload.delete({ collection: "sites", id: siteId, overrideAccess: true });
    logger.info("Deleted site and pages");
  }

  // Reset globals to empty
  await payload.updateGlobal({ slug: "branding", data: { siteName: "", siteDescription: "" } });
  await payload.updateGlobal({ slug: "main-menu", data: { navItems: [] } });
  await payload.updateGlobal({
    slug: "footer",
    data: { tagline: "", copyright: "", columns: [], socialLinks: [], credits: "" },
  });
  logger.info("Reset globals");
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const args = process.argv.slice(2);
  const shouldClean = args.includes("--clean");

  logger.info("Initializing Payload...");
  const payload = await getPayload({ config: await buildConfigWithDefaults() });

  try {
    if (shouldClean) {
      await cleanSiteData(payload);
      logger.info("Site data cleaned.");
      return;
    }

    const site = await findOrCreateSite(payload);
    await setupBranding(payload);
    await setupMainMenu(payload);
    await setupFooter(payload);
    await setupSettings(payload);
    await findOrCreateHomePage(payload, site.id);
    await findOrCreateAboutPage(payload, site.id);

    logger.info("=== Site Setup Complete ===");
    logger.info("  Site: %s (id=%d)", site.name, site.id);
    logger.info("  Pages: Home, About");
    logger.info("  Menu: Home, Explore, About");
  } catch (error) {
    logError(error, "Failed to set up site");
    process.exit(1);
  } finally {
    if (payload.db?.pool != null && (payload.db.pool as { ended?: boolean }).ended !== true) {
      try {
        await (payload.db.pool as { end?: () => Promise<void> }).end?.();
      } catch {
        // Connection pool will be cleaned up on process exit
      }
    }
  }
};

const run = async () => {
  await main();
  process.exit(0);
};

void run();
