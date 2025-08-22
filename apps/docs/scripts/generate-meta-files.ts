#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiDir = path.join(__dirname, "../content/reference/api");

interface MetaEntry {
  [key: string]: string | MetaEntry;
}

function toTitleCase(str: string): string {
  // Special cases for abbreviations and technical terms
  const specialCases: Record<string, string> = {
    api: "API",
    url: "URL",
    id: "ID",
    ids: "IDs",
    ui: "UI",
    css: "CSS",
    html: "HTML",
    http: "HTTP",
    https: "HTTPS",
    json: "JSON",
    xml: "XML",
    csv: "CSV",
    sql: "SQL",
    db: "DB",
    uuid: "UUID",
    jwt: "JWT",
    oauth: "OAuth",
    auth: "Auth",
    "url-fetch-job": "URL Fetch Job",
    "url-fetch-job-1": "URL Fetch Job",
    "use-debounce": "Use Debounce",
    "use-event-stats": "Use Event Stats",
    "use-events-queries": "Use Events Queries",
    "use-theme": "Use Theme",
    "dataset-schemas": "Dataset Schemas",
    "geocoding-providers": "Geocoding Providers",
    "import-files": "Import Files",
    "import-jobs": "Import Jobs",
    "location-cache": "Location Cache",
    "scheduled-imports": "Scheduled Imports",
    "shared-fields": "Shared Fields",
    "main-menu": "Main Menu",
    "import-constants": "Import Constants",
    "auth-fields": "Auth Fields",
    "basic-fields": "Basic Fields",
    "execution-fields": "Execution Fields",
    "schedule-fields": "Schedule Fields",
    "target-fields": "Target Fields",
    "webhook-fields": "Webhook Fields",
    "analyze-duplicates-job": "Analyze Duplicates Job",
    "cleanup-approval-locks-job": "Cleanup Approval Locks Job",
    "cleanup-stuck-scheduled-imports-job": "Cleanup Stuck Scheduled Imports Job",
    "create-events-batch-job": "Create Events Batch Job",
    "create-schema-version-job": "Create Schema Version Job",
    "dataset-detection-job": "Dataset Detection Job",
    "geocode-batch-job": "Geocode Batch Job",
    "schedule-manager-job": "Schedule Manager Job",
    "schema-detection-job": "Schema Detection Job",
    "validate-schema-job": "Validate Schema Job",
    "fetch-utils": "Fetch Utils",
    "scheduled-import-utils": "Scheduled Import Utils",
    "job-inputs": "Job Inputs",
    "data-parsing": "Data Parsing",
    "data-validation": "Data Validation",
    "event-processing": "Event Processing",
    "job-context": "Job Context",
    "error-recovery": "Error Recovery",
    "cache-manager": "Cache Manager",
    "geocoding-operations": "Geocoding Operations",
    "geocoding-service": "Geocoding Service",
    "provider-manager": "Provider Manager",
    "id-generation": "ID Generation",
    "coordinate-parser": "Coordinate Parser",
    "coordinate-validation-utils": "Coordinate Validation Utils",
    "coordinate-validator": "Coordinate Validator",
    "format-detector": "Format Detector",
    "geo-location-detector": "Geo Location Detector",
    "progress-tracking": "Progress Tracking",
    "rate-limit-service": "Rate Limit Service",
    "schedule-service": "Schedule Service",
    "schema-builder": "Schema Builder",
    "field-statistics": "Field Statistics",
    "pattern-detection": "Pattern Detection",
    "schema-comparison": "Schema Comparison",
    "schema-versioning": "Schema Versioning",
    "stage-transition": "Stage Transition",
    "type-transformation": "Type Transformation",
    "schema-detection": "Schema Detection",
    "cron-parser": "Cron Parser",
    "file-readers": "File Readers",
    "map-clusters": "Map Clusters",
    "[importId]": "Import",
    "[token]": "Token",
  };

  // Check for exact match first
  const lower = str.toLowerCase();
  if (specialCases[lower]) {
    return specialCases[lower];
  }

  // Otherwise, convert kebab-case to Title Case
  return str
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((word) => {
      const lowerWord = word.toLowerCase();
      if (specialCases[lowerWord]) {
        return specialCases[lowerWord];
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function generateMetaForDirectory(dir: string, relativePath: string = ""): void {
  const items = fs.readdirSync(dir);
  const meta: MetaEntry = {};

  // Process directories and .mdx files
  items.forEach((item) => {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      // Skip hidden directories
      if (item.startsWith(".")) return;

      // Recursively generate meta for subdirectories
      const subPath = relativePath ? `${relativePath}/${item}` : item;
      generateMetaForDirectory(itemPath, subPath);

      // Add directory to meta
      meta[item] = toTitleCase(item);
    } else if (item.endsWith(".mdx") && item !== "index.mdx") {
      // Add .mdx files to meta (without extension)
      const name = item.replace(".mdx", "");

      // For route.mdx files, add special handling
      if (name === "route") {
        // Get parent directory name for better title
        const parentDir = path.basename(dir);
        meta[name] = toTitleCase(parentDir);
      } else {
        meta[name] = toTitleCase(name);
      }
    }
  });

  // Only create _meta.json if there are items to include
  if (Object.keys(meta).length > 0) {
    const metaPath = path.join(dir, "_meta.json");
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log(`Generated: ${relativePath ? relativePath + "/" : ""}_meta.json`);
  }
}

console.log("Generating _meta.json files for API documentation...\n");

if (fs.existsSync(apiDir)) {
  generateMetaForDirectory(apiDir);
  console.log("\n✓ Meta file generation complete!");
} else {
  console.error("API directory not found:", apiDir);
  process.exit(1);
}
