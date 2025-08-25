#!/usr/bin/env tsx

/**
 * Generate _meta.json files for API documentation.
 * Automatically creates navigation metadata from the file structure.
 *
 * @module
 */

import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiDir = path.join(__dirname, "../content/reference/api");

interface MetaEntry {
  [key: string]: string | MetaEntry;
}

const toTitleCase = (str: string): string => {
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
    cors: "CORS",
    crud: "CRUD",
    rest: "REST",
    graphql: "GraphQL",
    websocket: "WebSocket",
    ws: "WebSocket",
    cli: "CLI",
    sdk: "SDK",
    pdf: "PDF",
    ux: "UX",
  };

  return str
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (specialCases[lower]) {
        return specialCases[lower];
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

const getSpecialName = (name: string, parentPath = ""): string => {
  const specialNames: Record<string, string> = {
    // Root level
    index: "Overview",
    readme: "Overview",

    // Common patterns
    route: "Route",
    page: "Page",

    // Job names
    "url-fetch-job-1": "URL Fetch Job (Alternate)",

    // Hook names
    "use-debounce": "Use Debounce",
    "use-event-stats": "Use Event Stats",
    "use-events-queries": "Use Events Queries",
    "use-theme": "Use Theme",

    // Collection names
    "dataset-schemas": "Dataset Schemas",
    "geocoding-providers": "Geocoding Providers",
    "import-files": "Import Files",
    "import-jobs": "Import Jobs",
    "location-cache": "Location Cache",
    "scheduled-imports": "Scheduled Imports",
    "shared-fields": "Shared Fields",
  };

  // Remove .mdx extension for lookup
  const nameWithoutExt = name.replace(/\.mdx?$/, "");

  // Check for specific override
  if (specialNames[name]) {
    return specialNames[name];
  }

  if (specialNames[nameWithoutExt]) {
    return specialNames[nameWithoutExt];
  }

  // For route.mdx files, use parent directory name
  if (nameWithoutExt === "route" && parentPath) {
    const parentName = path.basename(parentPath);
    const parentSpecialCases: Record<string, string> = {
      "schedule-service": "Schedule Service Endpoint",
      events: "Events Endpoint",
      health: "Health Check Endpoint",
      preview: "Preview Endpoint",
      histogram: "Histogram Endpoint",
      list: "List Endpoint",
      "map-clusters": "Map Clusters Endpoint",
    };

    if (parentSpecialCases[parentName]) {
      return parentSpecialCases[parentName];
    }

    return toTitleCase(parentName) + " Endpoint";
  }

  return toTitleCase(nameWithoutExt);
};

const generateMetaForDirectory = (dirPath: string): MetaEntry | null => {
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  const items = fs.readdirSync(dirPath);
  const meta: MetaEntry = {};

  // Filter and process items
  const validItems = items
    .filter((item) => {
      // Skip _meta.json itself
      if (item === "_meta.json") return false;

      // Skip hidden files
      if (item.startsWith(".")) return false;

      // Skip README.md/mdx (we use index.mdx)
      if (item.toLowerCase() === "readme.md" || item.toLowerCase() === "readme.mdx") return false;

      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      // Include directories and .mdx/.md files
      return stat.isDirectory() || item.endsWith(".mdx") || item.endsWith(".md");
    })
    .sort((a, b) => {
      // Sort order: index first, then alphabetically
      if (a.includes("index")) return -1;
      if (b.includes("index")) return 1;

      // route.mdx should come before other files in the same directory
      if (a === "route.mdx" || a === "route.md") return -1;
      if (b === "route.mdx" || b === "route.md") return 1;

      return a.localeCompare(b);
    });

  // Generate meta entries
  for (const item of validItems) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);

    // Remove .mdx/.md extension for the key
    const key = item.replace(/\.mdx?$/, "");

    // Get display name
    const displayName = getSpecialName(item, dirPath);

    // For directories, check if they have subdirectories to determine structure
    if (stat.isDirectory()) {
      const subItems = fs.readdirSync(itemPath);
      const hasSubDirs = subItems.some((subItem) => {
        const subPath = path.join(itemPath, subItem);
        return fs.statSync(subPath).isDirectory() && !subItem.startsWith(".");
      });

      // Only add to meta if directory has content
      const hasMdxFiles = subItems.some((subItem) => subItem.endsWith(".mdx") || subItem.endsWith(".md"));
      if (hasSubDirs || hasMdxFiles) {
        meta[key] = displayName;

        // Recursively generate meta for subdirectories
        generateMetaForDirectory(itemPath);
      }
    } else if (item.endsWith(".mdx") || item.endsWith(".md")) {
      meta[key] = displayName;
    }
  }

  // Only write _meta.json if there are items
  if (Object.keys(meta).length > 0) {
    const metaPath = path.join(dirPath, "_meta.json");
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    console.log(`Generated: ${path.relative(apiDir, metaPath)}`);
    return meta;
  }

  return null;
};

const generateAllMetaFiles = (startDir = apiDir): void => {
  console.log("Generating _meta.json files for API documentation...\n");

  // Start from the API root
  generateMetaForDirectory(startDir);

  console.log("\n✓ Meta file generation complete!");
};

const main = (): void => {
  generateAllMetaFiles();
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateAllMetaFiles, generateMetaForDirectory, getSpecialName, toTitleCase };
