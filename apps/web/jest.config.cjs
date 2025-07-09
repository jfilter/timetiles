module.exports = {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  roots: ["<rootDir>/lib", "<rootDir>/scripts", "<rootDir>/__tests__"],
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.spec.ts",
    "**/?(*.)+(spec|test).ts",
  ],
  transform: {
    "^.+\\.(ts|js)$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^@payload-config$": "<rootDir>/payload.config.ts",
    "^@/(.*)$": "<rootDir>/$1",
    "^@workspace/ui/(.*)$": "<rootDir>/../../packages/ui/src/$1",
  },
  collectCoverageFrom: [
    "lib/**/*.ts",
    "scripts/**/*.ts",
    "!lib/**/*.d.ts",
    "!**/node_modules/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  setupFiles: ["<rootDir>/__tests__/jest.d.ts"],
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.ts"],
  testTimeout: 30000,
  verbose: true,
  transformIgnorePatterns: ["node_modules/(?!(payload|@payloadcms)/)"],
  detectOpenHandles: true,
  forceExit: true,
  maxWorkers: 1,
  // Add these options to help with cleanup
  openHandlesTimeout: 0,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
