#!/usr/bin/env node
/**
 * CLI tool for managing data packages.
 *
 * Installs, uninstalls, and lists curated data packages defined as YAML
 * manifests in `config/data-packages/`. Each package creates a catalog,
 * dataset, and scheduled ingest.
 *
 * Usage:
 *   pnpm packages list                         # List available packages
 *   pnpm packages install berlin-demonstrations # Install a package
 *   pnpm packages install --all                 # Install all packages
 *   pnpm packages install --all --trigger       # Install all + trigger first import
 *   pnpm packages uninstall berlin-demonstrations # Disable a package
 *   pnpm packages uninstall --all               # Disable all packages
 *
 * @module
 * @category Scripts
 */

import { getPayload } from "payload";

import { createSystemUserService } from "@/lib/account/system-user";
import { buildConfigWithDefaults } from "@/lib/config/payload-config-factory";
import {
  activateDataPackage,
  deactivateDataPackage,
  getActivationStatus,
} from "@/lib/data-packages/activation-service";
import { loadAllManifests, loadManifest } from "@/lib/data-packages/manifest-loader";
import { createLogger, logError } from "@/lib/logger";

const logger = createLogger("packages");

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const listPackages = async (payload: PayloadInstance) => {
  const manifests = loadAllManifests();

  if (manifests.length === 0) {
    logger.info("No data packages found in config/data-packages/");
    return;
  }

  const slugs = manifests.map((m) => m.slug);
  const statusMap = await getActivationStatus(payload, slugs);

  logger.info("Available data packages (%d):", manifests.length);
  logger.info("");

  for (const m of manifests) {
    const activation = statusMap.get(m.slug);
    let status = "not installed";
    if (activation) status = activation.enabled ? "active" : "disabled";
    const records = m.estimatedRecords ? ` (~${Math.round(m.estimatedRecords / 1000)}k records)` : "";
    logger.info("  %-30s [%s]%s", m.slug, status, records);
    logger.info("    %s", m.name);
    if (m.region) logger.info("    Region: %s", m.region);
  }
};

const installPackage = async (
  payload: PayloadInstance,
  slug: string,
  shouldTrigger: boolean,
  parameters: Record<string, string> = {}
) => {
  const manifest = loadManifest(slug);
  if (!manifest) {
    logger.error("Package not found: %s", slug);
    logger.info("Run 'pnpm packages list' to see available packages.");
    process.exit(1);
  }

  // Show required parameters if not provided
  const requiredParams = (manifest.parameters ?? []).filter((p) => p.required);
  const missingParams = requiredParams.filter((p) => !parameters[p.name]);
  if (missingParams.length > 0) {
    logger.error("Missing required parameters:");
    for (const p of missingParams) {
      logger.error("  --param %s=<%s>%s", p.name, p.label, p.example ? ` (e.g. ${p.example})` : "");
    }
    process.exit(1);
  }

  const systemUser = await getOrCreateSystemUser(payload);

  try {
    const result = await activateDataPackage(payload, manifest, systemUser, {
      triggerFirstImport: shouldTrigger,
      parameters,
    });
    const paramInfo =
      Object.keys(parameters).length > 0
        ? ` [${Object.entries(parameters)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}]`
        : "";
    logger.info(
      "Installed: %s%s (catalog=%d, dataset=%d, schedule=%d)",
      slug,
      paramInfo,
      result.catalogId,
      result.datasetId,
      result.scheduledIngestId
    );
    if (shouldTrigger) {
      logger.info("  First import triggered.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("already activated")) {
      logger.info("Package already installed: %s", slug);
    } else {
      throw error;
    }
  }
};

const installAllPackages = async (payload: PayloadInstance, shouldTrigger: boolean) => {
  const manifests = loadAllManifests();
  if (manifests.length === 0) {
    logger.info("No data packages found.");
    return;
  }

  logger.info("Installing %d packages...", manifests.length);
  for (const manifest of manifests) {
    await installPackage(payload, manifest.slug, shouldTrigger);
  }
  logger.info("Done. Installed %d packages.", manifests.length);
};

const printParameters = (manifest: ReturnType<typeof loadManifest>) => {
  if (!manifest?.parameters?.length) return;
  logger.info("");
  logger.info("  Parameters:");
  for (const p of manifest.parameters) {
    logger.info("    --param %s=<%s>%s", p.name, p.label, p.example ? `  (e.g. ${p.example})` : "");
  }
};

const setupPackage = (slug: string) => {
  const manifest = loadManifest(slug);
  if (!manifest) {
    logger.error("Package not found: %s", slug);
    process.exit(1);
  }

  logger.info("");
  logger.info("  %s", manifest.name);
  if (manifest.description) logger.info("  %s", manifest.description);
  logger.info("");

  if (!manifest.setup) {
    logger.info("  No setup required — this package has no external credentials.");
    printParameters(manifest);
    return;
  }

  logger.info("  Setup instructions:");
  logger.info("");
  for (const line of manifest.setup.instructions.trim().split("\n")) {
    logger.info("    %s", line);
  }

  if (manifest.setup.url) {
    logger.info("");
    logger.info("  Documentation: %s", manifest.setup.url);
  }

  logger.info("");
  logger.info("  Environment variables:");
  for (const envVar of manifest.setup.envVars) {
    logger.info("    %s %s", process.env[envVar] ? "✓" : "✗", envVar);
  }

  printParameters(manifest);

  const paramHint = manifest.parameters?.length ? " --param ..." : "";
  logger.info("");
  logger.info("  Install command:");
  logger.info("    pnpm packages install %s%s --trigger", slug, paramHint);
  logger.info("");
};

const uninstallPackage = async (payload: PayloadInstance, slug: string) => {
  const manifest = loadManifest(slug);
  if (!manifest) {
    logger.error("Package not found: %s", slug);
    process.exit(1);
  }

  const systemUser = await getOrCreateSystemUser(payload);

  try {
    await deactivateDataPackage(payload, slug, systemUser);
    logger.info("Uninstalled (disabled): %s", slug);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not activated")) {
      logger.info("Package not installed: %s", slug);
    } else {
      throw error;
    }
  }
};

const uninstallAllPackages = async (payload: PayloadInstance) => {
  const manifests = loadAllManifests();
  const slugs = manifests.map((m) => m.slug);
  const statusMap = await getActivationStatus(payload, slugs);

  const systemUser = await getOrCreateSystemUser(payload);
  let count = 0;

  for (const [slug, activation] of statusMap) {
    if (activation) {
      try {
        await deactivateDataPackage(payload, slug, systemUser);
        logger.info("Uninstalled (disabled): %s", slug);
        count++;
      } catch (error) {
        logger.warn("Failed to uninstall %s: %s", slug, error instanceof Error ? error.message : "unknown error");
      }
    }
  }

  logger.info("Uninstalled %d packages.", count);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getOrCreateSystemUser = async (payload: PayloadInstance) => {
  const service = createSystemUserService(payload);
  return service.getOrCreateSystemUser();
};

/** Parse `--param key=value` flags from args into a record. */
const parseParams = (args: string[]): Record<string, string> => {
  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--param" && args[i + 1]) {
      const [key, ...rest] = args[i + 1]!.split("=");
      if (key && rest.length > 0) {
        params[key] = rest.join("=");
        i++; // skip next arg
      }
    }
  }
  return params;
};

const printUsage = () => {
  logger.info("Usage: pnpm packages <command> [options]");
  logger.info("");
  logger.info("Commands:");
  logger.info("  list                                    List available data packages");
  logger.info("  setup <slug>                            Show setup instructions + env var status");
  logger.info("  install <slug>                          Install a data package");
  logger.info("  install <slug> --param key=value        Install with parameters");
  logger.info("  install --all                           Install all data packages");
  logger.info("  install --all --trigger                 Install all + trigger first import");
  logger.info("  uninstall <slug>                        Uninstall (disable) a data package");
  logger.info("  uninstall --all                         Uninstall all data packages");
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const parseSlug = (args: string[], command: string): string => {
  const slug = args.slice(1).find((a) => !a.startsWith("--"));
  if (!slug || slug === command) {
    logger.error("Specify a package slug or use --all");
    printUsage();
    process.exit(1);
  }
  return slug;
};

const runCommand = async (payload: PayloadInstance, command: string, args: string[]) => {
  switch (command) {
    case "list":
    case "ls":
      return listPackages(payload);

    case "setup":
      return setupPackage(parseSlug(args, command));

    case "install":
    case "add": {
      const shouldTrigger = args.includes("--trigger");
      const parameters = parseParams(args);
      return args.includes("--all")
        ? installAllPackages(payload, shouldTrigger)
        : installPackage(payload, parseSlug(args, command), shouldTrigger, parameters);
    }

    case "uninstall":
    case "remove":
      return args.includes("--all")
        ? uninstallAllPackages(payload)
        : uninstallPackage(payload, parseSlug(args, command));

    default:
      logger.error("Unknown command: %s", command);
      printUsage();
      process.exit(1);
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  logger.info("Initializing Payload...");
  const payload = await getPayload({ config: await buildConfigWithDefaults() });

  try {
    await runCommand(payload, command, args);
  } catch (error) {
    logError(error, "Failed to manage packages");
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
