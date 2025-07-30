/**
 * @module This file serves as the main entry point for the seeding system.
 *
 * It exports the primary `SeedManager` class and its factory function, `createSeedManager`,
 * which are the intended public interface for initiating seeding operations. It also
 * re-exports the core `SeedData` and `SeedOptions` types for convenience when using
 * the seeding system programmatically.
 */
// Main export for the seed system
export { createSeedManager, SeedManager } from "./seed-manager";
export type { SeedData, SeedOptions } from "./types";
