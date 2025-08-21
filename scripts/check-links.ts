#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const docsDir = path.join(repoRoot, 'apps/docs/pages');

// Regular expressions to match different link types
const linkPatterns = [
  // Markdown links: [text](url)
  /\[([^\]]+)\]\(([^)]+)\)/g,
  // MDX imports
  /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
  // Next.js Link component href
  /href=["']([^"']+)["']/g,
  // Direct URL references in text
  /https?:\/\/[^\s<>)"']+/g,
];

// Patterns to ignore
const ignorePatterns = [
  /^#/, // Anchor links
  /^mailto:/, // Email links
  /^javascript:/, // JavaScript links
  /localhost/, // Local development URLs
  /127\.0\.0\.1/, // Local IPs
  /example\.com/, // Example domains
  /\$\{/, // Template variables
];

// Directories to ignore when scanning
const ignoreDirs = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  'test-results',
  'playwright-report',
];

interface BrokenLink {
  file: string;
  link: string;
  error: string;
}

interface LinkCheckResults {
  total: number;
  internal: {
    valid: number;
    broken: BrokenLink[];
  };
  external: {
    valid: number;
    broken: BrokenLink[];
    skipped: string[];
  };
}

interface InternalLinkResult {
  valid: boolean;
  resolved: string;
}

async function findAllMarkdownFiles(): Promise<string[]> {
  // Build ignore pattern for glob
  const ignorePattern = `{${ignoreDirs.join(',')}}`;
  
  // Find all MD and MDX files in the repository
  const pattern = path.join(repoRoot, '**/*.{md,mdx}');
  const files = await glob(pattern, {
    ignore: [`**/${ignorePattern}/**`],
  });
  
  return files;
}

function extractLinks(content: string, filePath: string): string[] {
  const links = new Set<string>();
  
  // Remove code blocks to avoid false positives
  // Remove inline code first
  let cleanContent = content.replace(/`[^`]+`/g, '');
  // Remove triple-backtick code blocks
  cleanContent = cleanContent.replace(/```[\s\S]*?```/g, '');
  // Remove indented code blocks (4 spaces or 1 tab)
  cleanContent = cleanContent.replace(/^(?: {4}|\t).+$/gm, '');
  
  linkPatterns.forEach(pattern => {
    const matches = cleanContent.matchAll(pattern);
    for (const match of matches) {
      // Get the URL from the match (position varies by pattern)
      const url = match[2] || match[1];
      if (url && !ignorePatterns.some(ignore => ignore.test(url))) {
        links.add(url);
      }
    }
  });
  
  return Array.from(links);
}

function resolveInternalLink(link: string, currentFile: string): InternalLinkResult | null {
  // For documentation files in apps/docs/pages, resolve relative to that directory
  const isDocsFile = currentFile.startsWith(docsDir);
  
  // Handle relative paths
  if (link.startsWith('./') || link.startsWith('../')) {
    const dir = path.dirname(currentFile);
    let resolved = path.resolve(dir, link);
    
    // Remove fragment identifier
    resolved = resolved.split('#')[0];
    
    // Check if file exists with various extensions
    const extensions = ['', '.mdx', '.md', '.tsx', '.ts', '.jsx', '.js', '/index.mdx', '/index.md'];
    for (const ext of extensions) {
      const testPath = resolved + ext;
      if (fs.existsSync(testPath)) {
        return { valid: true, resolved: testPath };
      }
    }
    
    return { valid: false, resolved };
  }
  
  // Handle absolute paths from docs root (only for docs files)
  if (link.startsWith('/') && isDocsFile) {
    const resolved = path.join(docsDir, link);
    const extensions = ['', '.mdx', '.md', '/index.mdx', '/index.md'];
    
    for (const ext of extensions) {
      const testPath = resolved.split('#')[0] + ext;
      if (fs.existsSync(testPath)) {
        return { valid: true, resolved: testPath };
      }
    }
    
    return { valid: false, resolved };
  }
  
  // Handle repository root paths (starting with /)
  if (link.startsWith('/')) {
    // Could be a repo path or a web path - check if it exists as a file
    const resolved = path.join(repoRoot, link);
    const extensions = ['', '.md', '.mdx'];
    
    for (const ext of extensions) {
      const testPath = resolved.split('#')[0] + ext;
      if (fs.existsSync(testPath)) {
        return { valid: true, resolved: testPath };
      }
    }
    
    // Don't mark as invalid - could be a valid web route
    return null;
  }
  
  return null; // External link or web route
}

async function checkExternalLink(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)',
      },
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    // Try GET if HEAD fails
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)',
        },
      });
      
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}

async function checkLinks(): Promise<void> {
  console.log('🔍 Checking links in markdown files across the repository...\n');
  
  const files = await findAllMarkdownFiles();
  console.log(`Found ${files.length} markdown files to check\n`);
  
  const results: LinkCheckResults = {
    total: 0,
    internal: { valid: 0, broken: [] },
    external: { valid: 0, broken: [], skipped: [] },
  };
  
  // Track checked external URLs to avoid duplicates
  const checkedUrls = new Map<string, boolean>();
  
  // Group files by directory for better output
  const filesByDir: Record<string, string[]> = {};
  files.forEach(file => {
    const relativeFile = path.relative(repoRoot, file);
    const dir = path.dirname(relativeFile);
    if (!filesByDir[dir]) {
      filesByDir[dir] = [];
    }
    filesByDir[dir].push(file);
  });
  
  // Process files directory by directory
  for (const [dir, dirFiles] of Object.entries(filesByDir)) {
    console.log(`\n📁 ${dir}/`);
    
    for (const file of dirFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const links = extractLinks(content, file);
      const relativeFile = path.relative(repoRoot, file);
      const fileName = path.basename(file);
      
      if (links.length === 0) continue;
      
      process.stdout.write(`  📄 ${fileName} (${links.length} links) `);
      
      for (const link of links) {
        results.total++;
        
        // Check if it's an internal link
        const internal = resolveInternalLink(link, file);
        if (internal !== null) {
          if (internal.valid) {
            results.internal.valid++;
            process.stdout.write('.');
          } else {
            results.internal.broken.push({
              file: relativeFile,
              link,
              error: 'File not found',
            });
            process.stdout.write('✗');
          }
        } else if (link.startsWith('http://') || link.startsWith('https://')) {
          // External link
          if (process.env.SKIP_EXTERNAL === 'true') {
            if (!results.external.skipped.includes(link)) {
              results.external.skipped.push(link);
            }
            process.stdout.write('○');
          } else if (checkedUrls.has(link)) {
            // Already checked this URL
            if (checkedUrls.get(link)) {
              results.external.valid++;
              process.stdout.write('.');
            } else {
              results.external.broken.push({
                file: relativeFile,
                link,
                error: 'Unreachable',
              });
              process.stdout.write('✗');
            }
          } else {
            // Check the URL
            const isValid = await checkExternalLink(link);
            checkedUrls.set(link, isValid);
            
            if (isValid) {
              results.external.valid++;
              process.stdout.write('.');
            } else {
              results.external.broken.push({
                file: relativeFile,
                link,
                error: 'Unreachable',
              });
              process.stdout.write('✗');
            }
          }
        }
      }
      
      console.log(''); // New line after each file
    }
  }
  
  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('📊 LINK CHECK RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\n✅ Valid links: ${results.internal.valid + results.external.valid}/${results.total}`);
  
  if (results.internal.broken.length > 0) {
    console.log('\n❌ Broken internal links:');
    
    // Group broken links by file for better readability
    const brokenByFile: Record<string, Array<{ link: string; error: string }>> = {};
    results.internal.broken.forEach(({ file, link, error }) => {
      if (!brokenByFile[file]) {
        brokenByFile[file] = [];
      }
      brokenByFile[file].push({ link, error });
    });
    
    Object.entries(brokenByFile).forEach(([file, links]) => {
      console.log(`\n  ${file}:`);
      links.forEach(({ link, error }) => {
        console.log(`    - ${link} (${error})`);
      });
    });
  }
  
  if (results.external.broken.length > 0) {
    console.log('\n❌ Broken external links:');
    
    // Group broken links by file
    const brokenByFile: Record<string, Array<{ link: string; error: string }>> = {};
    results.external.broken.forEach(({ file, link, error }) => {
      if (!brokenByFile[file]) {
        brokenByFile[file] = [];
      }
      brokenByFile[file].push({ link, error });
    });
    
    Object.entries(brokenByFile).forEach(([file, links]) => {
      console.log(`\n  ${file}:`);
      links.forEach(({ link, error }) => {
        console.log(`    - ${link} (${error})`);
      });
    });
  }
  
  if (results.external.skipped.length > 0) {
    const uniqueSkipped = [...new Set(results.external.skipped)];
    console.log(`\n⏭️  Skipped ${uniqueSkipped.length} unique external URLs (SKIP_EXTERNAL=true)`);
  }
  
  const hasErrors = results.internal.broken.length > 0 || results.external.broken.length > 0;
  
  if (hasErrors) {
    console.log('\n❌ Link check failed! Fix the broken links above.');
    process.exit(1);
  } else {
    console.log('\n✅ All links are valid!');
  }
}

// Run the checker
checkLinks().catch(error => {
  console.error('Error checking links:', error);
  process.exit(1);
});