#!/usr/bin/env tsx

import { createSeedManager } from '../lib/seed/index.js';

async function main() {
  const manager = createSeedManager();
  
  try {
    const payload = await manager.initialize();

    // Check each collection
    const collections = ['users', 'catalogs', 'datasets', 'events', 'imports'];

    for (const collection of collections) {
      const result = await payload.find({ collection, limit: 1 });
      if (result.docs.length === 0) {
        throw new Error(`No data found in ${collection}`);
      }
      console.log(`✅ ${collection}: ${result.docs.length} items found`);
    }

    // Check relationships
    const datasets = await payload.find({
      collection: 'datasets',
      limit: 1,
      depth: 1
    });

    if (datasets.docs.length > 0 && !datasets.docs[0].catalog) {
      throw new Error('Dataset catalog relationship not resolved');
    }

    console.log('✅ Relationships verified');
    
  } catch (error) {
    console.error('❌ Data verification failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await manager.cleanup();
    process.exit(0);
  }
}

main();
