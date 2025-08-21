#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.join(__dirname, '../pages');

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

async function findAllMdxFiles() {
  const pattern = path.join(docsDir, '**/*.{md,mdx}');
  return glob(pattern);
}

function extractLinks(content, filePath) {
  const links = new Set();
  
  linkPatterns.forEach(pattern => {
    const matches = content.matchAll(pattern);
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

function resolveInternalLink(link, currentFile) {
  // Handle relative paths
  if (link.startsWith('./') || link.startsWith('../')) {
    const dir = path.dirname(currentFile);
    let resolved = path.resolve(dir, link);
    
    // Remove fragment identifier
    resolved = resolved.split('#')[0];
    
    // Check if file exists with various extensions
    const extensions = ['', '.mdx', '.md', '/index.mdx', '/index.md'];
    for (const ext of extensions) {
      const testPath = resolved + ext;
      if (fs.existsSync(testPath)) {
        return { valid: true, resolved: testPath };
      }
    }
    
    return { valid: false, resolved };
  }
  
  // Handle absolute paths from docs root
  if (link.startsWith('/')) {
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
  
  return null; // External link
}

async function checkExternalLink(url) {
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

async function checkLinks() {
  console.log('🔍 Checking links in documentation...\n');
  
  const files = await findAllMdxFiles();
  const results = {
    total: 0,
    internal: { valid: 0, broken: [] },
    external: { valid: 0, broken: [], skipped: [] },
  };
  
  // Track checked external URLs to avoid duplicates
  const checkedUrls = new Map();
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const links = extractLinks(content, file);
    const relativeFile = path.relative(docsDir, file);
    
    if (links.length === 0) continue;
    
    console.log(`📄 ${relativeFile} (${links.length} links)`);
    
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
          results.external.skipped.push(link);
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
  
  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('📊 LINK CHECK RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\n✅ Valid links: ${results.internal.valid + results.external.valid}/${results.total}`);
  
  if (results.internal.broken.length > 0) {
    console.log('\n❌ Broken internal links:');
    results.internal.broken.forEach(({ file, link, error }) => {
      console.log(`   ${file}: ${link} (${error})`);
    });
  }
  
  if (results.external.broken.length > 0) {
    console.log('\n❌ Broken external links:');
    results.external.broken.forEach(({ file, link, error }) => {
      console.log(`   ${file}: ${link} (${error})`);
    });
  }
  
  if (results.external.skipped.length > 0) {
    console.log(`\n⏭️  Skipped ${results.external.skipped.length} external links (SKIP_EXTERNAL=true)`);
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