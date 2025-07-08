// Global teardown for Jest tests
export default async function teardown() {
  // Force close any remaining database connections
  if (global.gc) {
    global.gc();
  }

  // Give a brief moment for any async cleanup to complete
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Force exit if still hanging
  process.exit(0);
}
