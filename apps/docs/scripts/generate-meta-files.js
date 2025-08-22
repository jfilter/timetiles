#!/usr/bin/env node

/**
 * Generate _meta.json files for API documentation
 * Automatically creates navigation metadata from the file structure
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_DIR = path.join(__dirname, "../content/reference/api");

/**
 * Convert kebab-case or snake_case to Title Case
 */
function toTitleCase(str) {
  // Special cases for common abbreviations and terms
  const specialCases = {
    api: "API",
    url: "URL",
    id: "ID",
    ids: "IDs",
    http: "HTTP",
    https: "HTTPS",
    json: "JSON",
    xml: "XML",
    csv: "CSV",
    pdf: "PDF",
    db: "DB",
    sql: "SQL",
    ui: "UI",
    ux: "UX",
    cli: "CLI",
    sdk: "SDK",
    jwt: "JWT",
    oauth: "OAuth",
    cors: "CORS",
    crud: "CRUD",
    rest: "REST",
    graphql: "GraphQL",
    websocket: "WebSocket",
    ws: "WebSocket",
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
}

/**
 * Special naming rules for specific files/folders
 */
function getSpecialName(name, parentPath = "") {
  const specialNames = {
    // Root level
    index: "Overview",
    readme: "Overview",

    // Common patterns
    route: "Route",
    page: "Page",

    // Specific overrides based on context
    "route.mdx": parentPath.includes("/events") ? "Events Overview" : "Route",
    "index.mdx": "Overview",

    // Job names
    "url-fetch-job-1": "URL Fetch Job (Alternate)",

    // Remove .mdx extension for display
  };

  // Remove .mdx extension for lookup
  const nameWithoutExt = name.replace(/\.mdx$/, "");

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
    // Special case for admin/schedule-service
    if (parentName === "schedule-service") {
      return "Schedule Service Endpoint";
    }
    // Special case for events route
    if (parentName === "events") {
      return "Events Endpoint";
    }
    // Special case for health route
    if (parentName === "health") {
      return "Health Check Endpoint";
    }
    // Special case for preview route
    if (parentName === "preview") {
      return "Preview Endpoint";
    }
    return toTitleCase(parentName) + " Endpoint";
  }

  return toTitleCase(nameWithoutExt);
}

/**
 * Generate _meta.json for a directory
 */
function generateMetaForDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  const items = fs.readdirSync(dirPath);
  const meta = {};

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

      // Include directories and .mdx files
      return stat.isDirectory() || item.endsWith(".mdx");
    })
    .sort((a, b) => {
      // Sort order: index first, then alphabetically
      if (a.includes("index")) return -1;
      if (b.includes("index")) return 1;

      // route.mdx should come before other files in the same directory
      if (a === "route.mdx") return -1;
      if (b === "route.mdx") return 1;

      return a.localeCompare(b);
    });

  // Generate meta entries
  for (const item of validItems) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);

    // Remove .mdx extension for the key
    const key = item.replace(/\.mdx$/, "");

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
      const hasMdxFiles = subItems.some((subItem) => subItem.endsWith(".mdx"));
      if (hasSubDirs || hasMdxFiles) {
        meta[key] = displayName;

        // Recursively generate meta for subdirectories
        generateMetaForDirectory(itemPath);
      }
    } else if (item.endsWith(".mdx")) {
      meta[key] = displayName;
    }
  }

  // Only write _meta.json if there are items
  if (Object.keys(meta).length > 0) {
    const metaPath = path.join(dirPath, "_meta.json");
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    console.log(`Generated: ${path.relative(API_DIR, metaPath)}`);
    return meta;
  }

  return null;
}

/**
 * Recursively generate all _meta.json files
 */
function generateAllMetaFiles(startDir = API_DIR) {
  console.log("Generating _meta.json files for API documentation...\n");

  // Start from the API root
  generateMetaForDirectory(startDir);

  console.log("\n✓ Meta file generation complete!");
}

// Main execution
generateAllMetaFiles();
