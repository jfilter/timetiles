#!/usr/bin/env tsx

import { createSeedManager } from "../lib/seed/index.js";

async function main() {
  const manager = createSeedManager();

  try {
    const payload = await manager.initialize();

    const collections = ["users", "catalogs", "datasets", "events", "imports"];

    for (const collection of collections) {
      const result = await payload.find({ collection, limit: 1 });
      if (result.docs.length > 0) {
        throw new Error(`Data still exists in ${collection}`);
      }
    }

    console.log("✅ Full cleanup verified");
  } catch (error) {
    console.error(
      "❌ Cleanup verification failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    await manager.cleanup();
    process.exit(0);
  }
}

main();
