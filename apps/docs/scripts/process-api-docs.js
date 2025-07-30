#!/usr/bin/env node

/**
 * Post-processing script for TypeDoc-generated API documentation
 * to ensure Nextra compatibility and improved navigation
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DOCS_ROOT = join(__dirname, "..");
const API_DIR = join(DOCS_ROOT, "pages", "developers", "api");

// Files to skip during processing (to avoid conflicts)
const SKIP_FILES = ["README.md", "README.mdx"];

// Path restructuring mappings to create logical documentation organization
const PATH_MAPPINGS = {
  // Collections: lib/collections/* -> collections/*
  "lib/collections": "collections",
  
  // Services: lib/services/* -> services/*
  "lib/services": "services",
  
  // Job Handlers: lib/jobs/* -> jobs/*
  "lib/jobs": "jobs",
  
  // API Routes: app/api/* -> api/*
  "app/api": "api",
  
  // React Hooks: lib/hooks/* -> hooks/*
  "lib/hooks": "hooks",
  
  // Utilities: lib/utils/* -> utilities/*
  "lib/utils": "utilities",
  
  // Constants: lib/constants/* -> constants/*
  "lib/constants": "constants",
  
  // Types: lib/types/* -> types/*
  "lib/types": "types",
  
  // Logger: lib/logger -> utilities/logger
  "lib/logger": "utilities/logger",
  
  // Store: lib/store -> utilities/store
  "lib/store": "utilities/store",
  
  // Seed: lib/seed -> tools/seeding
  "lib/seed": "tools/seeding",
  
  // Health: lib/health -> utilities/health
  "lib/health": "utilities/health",
  
  // Filters: lib/filters -> utilities/filters
  "lib/filters": "utilities/filters",
  
  // Globals: lib/globals -> configuration/globals
  "lib/globals": "configuration/globals"
};

/**
 * Main processing function
 */
async function processApiDocs() {
  console.log("🚀 Processing TypeDoc-generated API documentation for Nextra...");

  try {
    // Ensure API directory exists
    if (!existsSync(API_DIR)) {
      console.error("❌ API directory not found. Run TypeDoc first: pnpm typedoc");
      process.exit(1);
    }

    // Process all markdown files in the API directory
    const stats = {
      processed: 0,
      created: 0,
      errors: 0,
    };

    await processDirectory(API_DIR, stats);

    // Restructure paths to create logical organization
    await restructurePaths(stats);

    // Improve content for better documentation experience
    await improveDocumentationContent(stats);

    // Generate navigation files
    await generateNavigationFiles();

    console.log("✅ API documentation processing complete!");
    console.log(`📊 Stats: ${stats.processed} files processed, ${stats.created} meta files created`);
  } catch (error) {
    console.error("❌ Error processing API docs:", error);
    process.exit(1);
  }
}

/**
 * Process a directory recursively
 */
async function processDirectory(dirPath, stats) {
  const items = readdirSync(dirPath);

  for (const item of items) {
    const itemPath = join(dirPath, item);
    const stat = statSync(itemPath);

    if (stat.isDirectory()) {
      // Process subdirectory
      await processDirectory(itemPath, stats);

      // Generate _meta.json for this directory
      await generateMetaFile(itemPath, stats);
    } else if (item.endsWith(".md") && !SKIP_FILES.includes(item)) {
      // Process markdown file (skip conflicting files)
      await processMarkdownFile(itemPath, stats);
    }
  }
}

/**
 * Process individual markdown files for Nextra compatibility
 */
async function processMarkdownFile(filePath, stats) {
  try {
    let content = readFileSync(filePath, "utf8");
    let modified = false;

    // Fix relative links to work with Nextra routing
    const relativeLinkRegex = /\[([^\]]+)\]\((?!http|#|\/)(.*?)\.md\)/g;
    content = content.replace(relativeLinkRegex, (match, text, path) => {
      modified = true;
      // Convert relative .md links to Nextra-style links
      return `[${text}](./${path})`;
    });

    // Improve code block formatting
    content = content.replace(/```typescript/g, "```ts");
    content = content.replace(/```javascript/g, "```js");

    // Add frontmatter if missing
    if (!content.startsWith("---")) {
      const title = extractTitle(content) || basename(filePath, ".md");
      // Quote title if it contains special YAML characters
      const quotedTitle =
        title.includes(":") || title.includes('"') || title.includes("'") || title.includes("<") || title.includes(">") || title.includes("\\")
          ? `"${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` 
          : title;
      const frontmatter = `---\ntitle: ${quotedTitle}\n---\n\n`;
      content = frontmatter + content;
      modified = true;
    }

    // Improve TypeDoc-generated content
    content = improveTypeDocContent(content);

    // Convert .md extension to .mdx for better Nextra integration
    const mdxPath = filePath.replace(/\.md$/, ".mdx");
    if (filePath !== mdxPath) {
      writeFileSync(mdxPath, content);
      // Remove original .md file
      try {
        const fs = await import("fs/promises");
        await fs.unlink(filePath);
      } catch (e) {
        // Ignore if file doesn't exist
      }
      stats.processed++;
    } else if (modified) {
      writeFileSync(filePath, content);
      stats.processed++;
    }
  } catch (error) {
    console.warn(`⚠️  Error processing ${filePath}:`, error.message);
    stats.errors++;
  }
}

/**
 * Generate _meta.json files for navigation
 */
async function generateMetaFile(dirPath, stats) {
  const metaPath = join(dirPath, "_meta.json");

  // Skip if _meta.json already exists
  if (existsSync(metaPath)) {
    return;
  }

  const items = readdirSync(dirPath);
  const meta = {};

  // Process markdown files and subdirectories
  for (const item of items) {
    const itemPath = join(dirPath, item);
    const stat = statSync(itemPath);

    if (stat.isDirectory() && !item.startsWith(".")) {
      // Add directory to navigation
      meta[item] = toTitleCase(item.replace(/[-_]/g, " "));
    } else if ((item.endsWith(".md") || item.endsWith(".mdx")) && item !== "index.md" && item !== "index.mdx") {
      // Add markdown file to navigation
      const key = basename(item, extname(item));
      const title = extractTitleFromFile(itemPath) || toTitleCase(key.replace(/[-_]/g, " "));
      meta[key] = title;
    }
  }

  // Sort entries: index first, then alphabetically
  const sortedMeta = {};
  if (meta.index) {
    sortedMeta.index = meta.index;
    delete meta.index;
  }

  Object.keys(meta)
    .sort()
    .forEach((key) => {
      sortedMeta[key] = meta[key];
    });

  if (Object.keys(sortedMeta).length > 0) {
    writeFileSync(metaPath, JSON.stringify(sortedMeta, null, 2));
    stats.created++;
  }
}

/**
 * Restructure paths according to PATH_MAPPINGS for logical organization
 */
async function restructurePaths(stats) {
  console.log("🔄 Restructuring paths for logical organization...");
  
  const fs = await import("fs/promises");
  
  for (const [oldPath, newPath] of Object.entries(PATH_MAPPINGS)) {
    const oldDir = join(API_DIR, oldPath);
    const newDir = join(API_DIR, newPath);
    
    if (existsSync(oldDir) && oldDir !== newDir) {
      try {
        // Create new directory structure
        await fs.mkdir(dirname(newDir), { recursive: true });
        
        // Move the directory
        await fs.rename(oldDir, newDir);
        
        // Update internal links in all moved files
        await updateLinksInDirectory(newDir, oldPath, newPath);
        
        console.log(`📁 Moved ${oldPath} → ${newPath}`);
        stats.processed += 5; // Rough estimate for moved files
      } catch (error) {
        console.warn(`⚠️  Failed to move ${oldPath} to ${newPath}:`, error.message);
      }
    }
  }
  
  // Clean up empty directories
  await cleanupEmptyDirectories(API_DIR);
}

/**
 * Update internal links in moved files
 */
async function updateLinksInDirectory(dirPath, oldPath, newPath) {
  const fs = await import("fs/promises");
  
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = join(dirPath, item.name);
      
      if (item.isDirectory()) {
        await updateLinksInDirectory(itemPath, oldPath, newPath);
      } else if (item.name.endsWith('.mdx')) {
        try {
          let content = await fs.readFile(itemPath, 'utf8');
          
          // Update relative links that reference the old path
          const oldPathRegex = new RegExp(`(\\]\\(\\.\\.\\/)+(${oldPath.replace(/\//g, '\\/')})`, 'g');
          content = content.replace(oldPathRegex, `$1${newPath}`);
          
          // Update breadcrumb references
          const breadcrumbRegex = new RegExp(`\\[web\\]\\(.*?\\) / (${oldPath.replace(/\//g, '\\/')})`, 'g');
          content = content.replace(breadcrumbRegex, `[web](../../README) / ${newPath}`);
          
          await fs.writeFile(itemPath, content);
        } catch (error) {
          console.warn(`⚠️  Failed to update links in ${itemPath}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️  Failed to update links in directory ${dirPath}:`, error.message);
  }
}

/**
 * Clean up empty directories after restructuring
 */
async function cleanupEmptyDirectories(dirPath) {
  const fs = await import("fs/promises");
  
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        const itemPath = join(dirPath, item.name);
        await cleanupEmptyDirectories(itemPath);
        
        // Check if directory is empty after recursive cleanup
        try {
          const contents = await fs.readdir(itemPath);
          if (contents.length === 0) {
            await fs.rmdir(itemPath);
            console.log(`🗑️  Removed empty directory: ${item.name}`);
          }
        } catch (error) {
          // Directory might not be empty or already removed, ignore
        }
      }
    }
  } catch (error) {
    // Directory might not exist, ignore
  }
}

/**
 * Improve documentation content for better user experience
 */
async function improveDocumentationContent(stats) {
  console.log("✨ Improving documentation content...");
  
  const fs = await import("fs/promises");
  
  // Define title mappings for better user-friendly names
  const TITLE_MAPPINGS = {
    // Collections
    "collections/catalogs": { title: "Catalogs Collection", section: "Collections" },
    "collections/datasets": { title: "Datasets Collection", section: "Collections" },
    "collections/events": { title: "Events Collection", section: "Collections" },
    "collections/users": { title: "Users Collection", section: "Collections" },
    "collections/import-files": { title: "Import Files Collection", section: "Collections" },
    "collections/import-jobs": { title: "Import Jobs Collection", section: "Collections" },
    "collections/dataset-schemas": { title: "Dataset Schemas Collection", section: "Collections" },
    "collections/shared-fields": { title: "Shared Fields", section: "Collections" },
    
    // Services
    "services/geocoding": { title: "Geocoding Service", section: "Services" },
    "services/rate-limit-service": { title: "Rate Limiting Service", section: "Services" },
    "services/import": { title: "Import Services", section: "Services" },
    "services/progress-tracking": { title: "Progress Tracking Service", section: "Services" },
    "services/schema-builder": { title: "Schema Builder Service", section: "Services" },
    
    // Hooks
    "hooks/use-debounce": { title: "Debounce Hooks", section: "React Hooks" },
    "hooks/use-events-queries": { title: "Events Query Hooks", section: "React Hooks" },
    "hooks/use-event-stats": { title: "Event Statistics Hooks", section: "React Hooks" },
    
    // API Routes
    "api/events": { title: "Events API", section: "API Routes" },
    "api/health": { title: "Health Check API", section: "API Routes" },
    "api/import": { title: "Import API", section: "API Routes" },
    
    // Utilities
    "utilities/slug": { title: "Slug Utilities", section: "Utilities" },
    "utilities/date": { title: "Date Utilities", section: "Utilities" },
    "utilities/logger": { title: "Logging System", section: "Utilities" },
    "utilities/store": { title: "State Management", section: "Utilities" },
  };
  
  // Process README files in restructured directories
  await improveDirectoryContent(API_DIR, "", TITLE_MAPPINGS, stats);
}

/**
 * Recursively improve content in directories
 */
async function improveDirectoryContent(dirPath, relativePath, titleMappings, stats) {
  const fs = await import("fs/promises");
  
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = join(dirPath, item.name);
      const currentPath = relativePath ? `${relativePath}/${item.name}` : item.name;
      
      if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
        await improveDirectoryContent(itemPath, currentPath, titleMappings, stats);
      } else if (item.name === 'README.mdx') {
        await improveReadmeContent(itemPath, relativePath, titleMappings, stats);
      }
    }
  } catch (error) {
    console.warn(`⚠️  Failed to process directory ${dirPath}:`, error.message);
  }
}

/**
 * Improve individual README.mdx files
 */
async function improveReadmeContent(filePath, sectionPath, titleMappings, stats) {
  const fs = await import("fs/promises");
  
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let modified = false;
    
    // Get mapping for this section
    const mapping = titleMappings[sectionPath];
    if (mapping) {
      // Update title in frontmatter
      content = content.replace(
        /^title: .*$/m,
        `title: "${mapping.title}"`
      );
      
      // Update main heading to be more user-friendly
      content = content.replace(
        /^# lib\/.*$/m,
        `# ${mapping.section} > ${mapping.title.replace(' Collection', '').replace(' Service', '').replace(' Hooks', '').replace(' API', '')}`
      );
      
      // Update generic "lib/..." headings too
      content = content.replace(
        /^# (lib\/[^\n]+)$/m,
        `# ${mapping.title}`
      );
      
      modified = true;
    } else {
      // Generic improvements for files without specific mappings
      // Remove "lib/" prefixes from titles and headings
      content = content.replace(/^title: lib\/(.*)$/m, (match, path) => {
        const cleanTitle = path.split('/').map(part => 
          part.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        ).join(' > ');
        return `title: "${cleanTitle}"`;
      });
      
      content = content.replace(/^# lib\/(.*)$/m, (match, path) => {
        const cleanTitle = path.split('/').map(part => 
          part.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        ).join(' > ');
        return `# ${cleanTitle}`;
      });
      
      modified = true;
    }
    
    if (modified) {
      await fs.writeFile(filePath, content);
      stats.processed++;
    }
  } catch (error) {
    console.warn(`⚠️  Failed to improve content in ${filePath}:`, error.message);
  }
}

/**
 * Generate top-level navigation files
 */
async function generateNavigationFiles() {
  // Create main API _meta.json if it doesn't exist
  const mainMetaPath = join(API_DIR, "_meta.json");
  if (!existsSync(mainMetaPath)) {
    const mainMeta = {
      index: "Overview",
      collections: "Collections",
      services: "Services",
      jobs: "Job Handlers",
      api: "API Routes",
      hooks: "React Hooks",
      utilities: "Utilities",
      constants: "Constants",
      types: "Types",
      tools: "Development Tools",
      configuration: "Configuration"
    };

    writeFileSync(mainMetaPath, JSON.stringify(mainMeta, null, 2));
    console.log("📝 Created main API navigation");
  }
}

/**
 * Improve TypeDoc-generated content for better readability
 */
function improveTypeDocContent(content) {
  // Remove excessive "Defined in" lines that clutter the docs
  content = content.replace(/^Defined in:? .*$/gm, "");

  // Improve table formatting
  content = content.replace(/\|(\s*-+\s*\|)+/g, (match) => {
    return match.replace(/-+/g, "---");
  });

  // Convert TypeDoc inheritance info to more readable format
  content = content.replace(/^Extends: `([^`]+)`$/gm, "**Extends:** `$1`");
  content = content.replace(/^Implements: `([^`]+)`$/gm, "**Implements:** `$1`");

  // Improve parameter documentation
  content = content.replace(/^### Parameters$/gm, "## Parameters");
  content = content.replace(/^### Returns$/gm, "## Returns");

  return content;
}

/**
 * Extract title from markdown content
 */
function extractTitle(content) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1] : null;
}

/**
 * Extract title from a file
 */
function extractTitleFromFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    return extractTitle(content);
  } catch {
    return null;
  }
}

/**
 * Convert string to title case
 */
function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

// Run the processor
if (import.meta.url === `file://${process.argv[1]}`) {
  processApiDocs();
}

export { processApiDocs };
