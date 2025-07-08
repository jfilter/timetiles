#!/usr/bin/env node

import { createSeedManager } from "../lib/seed/index.js";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Usage: npm run seed [command] [options]

Commands:
  seed [env] [collections...]   Seed data for the specified environment
  truncate [collections...]     Truncate specified collections
  help                         Show this help message

Examples:
  npm run seed                 # Seed all collections for development
  npm run seed test            # Seed all collections for test environment
  npm run seed development users catalogs  # Seed only users and catalogs
  npm run seed truncate        # Truncate all collections
  npm run seed truncate users  # Truncate only users collection
`);
    process.exit(0);
  }

  const seedManager = createSeedManager();

  try {
    if (command === "help") {
      console.log(`
Usage: npm run seed [command] [options]

Commands:
  seed [env] [collections...]   Seed data for the specified environment
  truncate [collections...]     Truncate specified collections
  help                         Show this help message

Examples:
  npm run seed                 # Seed all collections for development
  npm run seed test            # Seed all collections for test environment
  npm run seed development users catalogs  # Seed only users and catalogs
  npm run seed truncate        # Truncate all collections
  npm run seed truncate users  # Truncate only users collection
`);
    } else if (command === "truncate") {
      const collections = args.slice(1);
      await seedManager.truncate(collections);
    } else {
      // Default to seed command
      let environment = "development";
      let collections: string[] = [];

      // Parse arguments
      if (args.length > 0) {
        if (
          args[0] &&
          ["development", "test", "production"].includes(args[0])
        ) {
          environment = args[0] as any;
          collections = args.slice(1);
        } else {
          collections = args;
        }
      }

      await seedManager.seed({
        environment: environment as any,
        collections: collections.length > 0 ? collections : undefined,
        truncate: false,
      });
    }
  } catch (error) {
    console.error("❌ Seed operation failed:", error);
    process.exit(1);
  } finally {
    await seedManager.cleanup();
    process.exit(0);
  }
}

main();
