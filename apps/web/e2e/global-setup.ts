import { chromium, FullConfig } from '@playwright/test';
import { SeedManager } from '../lib/seed';

async function globalSetup(config: FullConfig) {
  console.log('🌱 Seeding database for E2E tests...');
  
  const seedManager = new SeedManager();
  
  try {
    // Seed with development data (don't truncate to avoid constraint issues)
    await seedManager.seed({
      environment: 'development',
      truncate: false,
      collections: ['users', 'catalogs', 'datasets', 'events']
    });
    
    console.log('✅ Database seeded successfully');
  } catch (error) {
    console.error('❌ Failed to seed database:', error);
    // Don't throw error if seeding fails - just continue with existing data
    console.log('⚠️ Continuing with existing database data');
  } finally {
    await seedManager.cleanup();
  }
}

export default globalSetup;