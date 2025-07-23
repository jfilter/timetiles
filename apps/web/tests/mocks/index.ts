// Centralized exports for all mocks and test data

// External mocks (auto-mocked libraries)
export * from "./external/next-navigation";

// Test data factories
export * from "./data/events";
export * from "./data/catalogs";
export * from "./data/datasets";

// Utility functions
export * from "./utils/factories";

// Re-export maplibre mock for convenience
export { default as maplibreMock } from "./external/maplibre-gl";