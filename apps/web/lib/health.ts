import { getPayload } from 'payload';
import { sql } from '@payloadcms/db-postgres';
import fs from 'fs/promises';
import path from 'path';
import config from '../payload.config';

async function checkEnvironmentVariables() {
  const requiredVars = ['PAYLOAD_SECRET', 'DATABASE_URL'];
  const missingVars = requiredVars.filter((v) => !process.env[v]);
  return {
    status: missingVars.length > 0 ? 'error' : 'ok',
    missing: missingVars,
  };
}

async function checkUploadsDirectory() {
  const uploadsDir = path.resolve(__dirname, '../uploads');
  try {
    await fs.access(uploadsDir, fs.constants.W_OK);
    return { status: 'ok' };
  } catch (error) {
    return { status: 'error', message: 'Uploads directory not writable' };
  }
}

async function checkGeocodingService() {
  try {
    const payload = await getPayload({ config });
    const providers = await payload.find({
      collection: 'geocoding-providers',
      where: { enabled: { equals: true } },
      limit: 1,
    });
    return {
      status: providers.totalDocs > 0 ? 'ok' : 'warning',
      message:
        providers.totalDocs > 0
          ? `${providers.totalDocs} enabled provider(s) found`
          : 'No enabled geocoding providers found in the database',
    };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}

async function checkPayloadCMS() {
  try {
    const payload = await getPayload({ config });
    await payload.find({ collection: 'users', limit: 1 });
    return { status: 'ok' };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}

async function checkMigrations() {
  const payload = await getPayload({ config });
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const migrationFiles = await fs.readdir(migrationsDir);
  const executedMigrations = await payload.find({
    collection: 'payload-migrations',
    limit: 1000,
  });
  const executedMigrationNames = executedMigrations.docs.map((m) => m.name);
  const pendingMigrations = migrationFiles.filter(
    (f) => f.endsWith('.ts') && !executedMigrationNames.includes(f.replace('.ts', ''))
  );

  return {
    status: pendingMigrations.length > 0 ? 'pending' : 'ok',
    pending: pendingMigrations,
  };
}

async function checkPostGIS() {
  const payload = await getPayload({ config });
  try {
    const postgisCheck = await payload.db.drizzle.execute(
      sql`SELECT 1 FROM pg_extension WHERE extname = 'postgis'`
    );
    return {
      status: (postgisCheck as any).rowCount > 0 ? 'ok' : 'not found',
    };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}

export async function runHealthChecks() {
  const [env, uploads, geocoding, cms, migrations, postgis] = await Promise.all([
    checkEnvironmentVariables(),
    checkUploadsDirectory(),
    checkGeocodingService(),
    checkPayloadCMS(),
    checkMigrations(),
    checkPostGIS(),
  ]);

  return {
    env,
    uploads,
    geocoding,
    cms,
    migrations,
    postgis,
  };
}