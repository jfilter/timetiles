#!/usr/bin/env tsx

import { createSeedManager } from "../lib/seed/index.js";

async function main() {
  const manager = createSeedManager();

  try {
    const payload = await manager.initialize();

    const users = await payload.find({ collection: "users", limit: 1 });
    const catalogs = await payload.find({ collection: "catalogs", limit: 1 });

    if (users.docs.length > 0) {
      throw new Error("Users not truncated");
    }

    if (catalogs.docs.length === 0) {
      throw new Error("Catalogs incorrectly truncated");
    }

    console.log("✅ Selective truncation verified");
  } catch (error) {
    console.error(
      "❌ Truncation verification failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    await manager.cleanup();
    process.exit(0);
  }
}

main();
