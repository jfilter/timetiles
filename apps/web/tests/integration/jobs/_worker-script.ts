/**
 * Minimal job worker script spawned as a child process.
 * Calls payload.jobs.run() once and outputs the result as JSON to stdout.
 *
 * Usage: DATABASE_URL=... WORKER_LIMIT=1 npx tsx tests/integration/jobs/_worker-script.ts
 *
 * @module
 * @category Test Utils
 */

// Suppress noisy logs
process.env.PAYLOAD_SECRET ??= "test-secret-key";
process.env.NEXT_PUBLIC_PAYLOAD_URL ??= "http://localhost:3000";

const limit = Number(process.env.WORKER_LIMIT ?? "1");
const databaseUrl = process.env.DATABASE_URL!;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const { getPayload } = await import("payload");
const { createTestConfig } = await import("../../../lib/config/payload-config-factory");

const config = await createTestConfig({ databaseUrl });
const payload = await getPayload({ config });

try {
  const result = await payload.jobs.run({ allQueues: true, limit });
  const jobIds = Object.keys(result.jobStatus ?? {});

  // Output result as JSON on a single line
  process.stdout.write(JSON.stringify({ jobIds, noJobsRemaining: result.noJobsRemaining ?? false }) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ jobIds: [], error: String(error) }) + "\n");
}

// Let connections drain
await new Promise((resolve) => setTimeout(resolve, 500));
process.exit(0);
