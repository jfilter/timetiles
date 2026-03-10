#!/usr/bin/env tsx
/**
 * OpenAPI specification generator.
 *
 * Generates OpenAPI spec from Zod schemas defined in the registry.
 * Run with: pnpm openapi:generate
 *
 * @module
 */
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as yaml from "yaml";

import { registry } from "../lib/openapi/registry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generator = new OpenApiGeneratorV3(registry.definitions);

const doc = generator.generateDocument({
  openapi: "3.0.3",
  info: {
    title: "TimeTiles API",
    version: "1.0.0",
    description: `
API for querying and aggregating geospatial event data in TimeTiles.

## Overview

TimeTiles provides endpoints for:
- **Event listing** with pagination and filtering
- **Aggregations** by catalog or dataset
- **Temporal histograms** for time-based analysis
- **Map clustering** for efficient visualization of large datasets
- **Cluster statistics** for consistent visualization scaling

## Authentication

Most endpoints support optional authentication. Authenticated users may have access to additional catalogs and datasets.

## Filtering

All event endpoints support common filter parameters:
- \`catalog\`: Filter by catalog ID
- \`datasets\`: Filter by dataset IDs (comma-separated or multiple params)
- \`startDate\` / \`endDate\`: Temporal filtering (ISO 8601 date format)
- \`bounds\`: Geographic bounding box as JSON string
    `.trim(),
    contact: {
      name: "TimeTiles",
      url: "https://github.com/timetiles/timetiles",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: "/",
      description: "Current server",
    },
  ],
  tags: [
    {
      name: "Events",
      description: "Event querying and aggregation endpoints",
    },
    {
      name: "System",
      description: "System health and status endpoints",
    },
  ],
});

// Ensure public directory exists
const publicDir = path.join(__dirname, "../public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write YAML
const yamlPath = path.join(publicDir, "openapi.yaml");
fs.writeFileSync(yamlPath, yaml.stringify(doc));

// Write JSON
const jsonPath = path.join(publicDir, "openapi.json");
fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));

// eslint-disable-next-line no-console
console.log(`OpenAPI spec generated:\n  YAML: ${yamlPath}\n  JSON: ${jsonPath}`);
