// Vitest setup file for seed tests
import { destroyRateLimitService } from "../lib/services/RateLimitService";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://timetiles_user:timetiles_password@localhost:5432/timetiles_test";

// Global teardown to ensure clean exit
afterAll(async () => {
  // Clean up rate limit service
  destroyRateLimitService();

  // Give time for all async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Force close any remaining connections
  if (process.env.NODE_ENV === "test") {
    // Give Vitest time to clean up
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});
