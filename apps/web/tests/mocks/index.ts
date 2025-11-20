/**
 * @module
 */
// Centralized exports for all mocks and test data

// External mocks (auto-mocked libraries)
export * from "./external/next-navigation";

// Re-export maplibre mock for convenience
export { default as maplibreMock } from "./external/maplibre-gl";

// Service mocks (for vi.mock() replacements)
export * from "./services";

// Test data factories (re-exported from setup for backward compatibility)
export * from "../setup/factories";
