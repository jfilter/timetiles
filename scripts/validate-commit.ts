#!/usr/bin/env tsx

/**
 * Commit message validation helper
 * 
 * Usage:
 *   tsx scripts/validate-commit.ts "fix(config): some message"
 *   tsx scripts/validate-commit.ts --test
 *   tsx scripts/validate-commit.ts --files .github/workflows/ci.yml
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

interface ParsedCommit {
  type: string | null;
  scope: string | null;
  subject: string;
  raw?: string;
}

interface ValidationResult {
  parsed: ParsedCommit;
  errors: Array<{ rule: string; message: string }>;
  warnings: Array<{ rule: string; message: string }>;
  suggestions: string[];
}

interface TestCase {
  name: string;
  message: string;
  files: string[];
  expectError: boolean;
  expectedSuggestion?: string;
}

// Get the list of files changed in the commit
function getChangedFiles(): string[] {
  try {
    // For staged changes (during commit)
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    
    if (staged.length > 0) {
      return staged;
    }
    
    // For last commit (when validating existing commits)
    const lastCommit = execSync('git diff HEAD~1 --name-only', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    
    return lastCommit;
  } catch (error) {
    return [];
  }
}

// Map file paths to expected scopes based on monorepo structure
function getExpectedScopes(files: string[]): string[] {
  const scopeMap: Record<string, string> = {
    // CI/CD and infrastructure
    '.github/': 'ci',
    '.circleci/': 'ci',
    'Dockerfile': 'build',
    'docker-compose': 'build',
    '.dockerignore': 'build',
    
    // Root configuration files
    'package.json': 'deps',
    'pnpm-lock.yaml': 'deps',
    'turbo.json': 'build',
    'commitlint.config': 'build',
    '.gitignore': 'build',
    '.gitattributes': 'build',
    'Makefile': 'build',
    
    // Apps
    'apps/web/': 'web',
    'apps/docs/': 'docs',
    
    // Packages
    'packages/ui/': 'ui',
    'packages/assets/': 'assets',
    'packages/eslint-config/': 'config',
    'packages/prettier-config/': 'config',
    'packages/typescript-config/': 'config',
    
    // Web app specific paths
    'apps/web/app/api/import/': 'import',
    'apps/web/app/api/events/': 'events',
    'apps/web/lib/services/geocoding': 'geocoding',
    'apps/web/lib/collections/events': 'events',
    'apps/web/lib/collections/datasets': 'schema',
    'apps/web/lib/collections/import': 'import',
    'apps/web/lib/collections/scheduled-imports': 'import',
    'apps/web/lib/jobs/': 'jobs',
    'apps/web/migrations/': 'db',
    'apps/web/lib/seed/': 'seed',
    'apps/web/tests/': 'test',
    'apps/web/app/api/': 'api',
    
    // Documentation
    'README.md': 'docs',
    'CLAUDE.md': 'docs',
    '*.md': 'docs',
    '*.mdx': 'docs',
  };
  
  const detectedScopes = new Set<string>();
  
  for (const file of files) {
    let scopeFound = false;
    
    // Check exact matches and prefixes
    for (const [pattern, scope] of Object.entries(scopeMap)) {
      if (pattern.endsWith('/')) {
        // Directory prefix match
        if (file.startsWith(pattern)) {
          detectedScopes.add(scope);
          scopeFound = true;
          break;
        }
      } else if (pattern.startsWith('*.')) {
        // Extension match
        const ext = pattern.slice(1);
        if (file.endsWith(ext)) {
          detectedScopes.add(scope);
          scopeFound = true;
          break;
        }
      } else {
        // Exact file or partial match
        if (file.includes(pattern)) {
          detectedScopes.add(scope);
          scopeFound = true;
          break;
        }
      }
    }
    
    // If no specific scope found, try to infer from top-level directory
    if (!scopeFound) {
      const parts = file.split('/');
      if (parts[0] === 'apps' && parts[1]) {
        detectedScopes.add(parts[1]); // e.g., 'web' or 'docs'
      } else if (parts[0] === 'packages' && parts[1]) {
        if (parts[1].includes('config')) {
          detectedScopes.add('config');
        } else {
          detectedScopes.add(parts[1]); // e.g., 'ui' or 'assets'
        }
      }
    }
  }
  
  return Array.from(detectedScopes);
}

// Helper to simulate git diff output for testing
function simulateGitDiff(files: string[]): void {
  const original = execSync.bind(global);
  (global as any).execSync = (cmd: string, opts: any) => {
    if (cmd.includes('git diff')) {
      return files.join('\n');
    }
    return original(cmd, opts);
  };
}

// Parse commit message
function parseCommitMessage(message: string): ParsedCommit {
  const regex = /^(\w+)(?:\(([^)]+)\))?: (.+)$/;
  const match = message.match(regex);
  
  if (!match) {
    return { type: null, scope: null, subject: message, raw: message };
  }
  
  return {
    type: match[1],
    scope: match[2] || null,
    subject: match[3],
    raw: message
  };
}

// Validate commit message
async function validateCommit(message: string, files: string[] = []): Promise<ValidationResult> {
  if (files.length > 0) {
    simulateGitDiff(files);
  }
  
  const parsed = parseCommitMessage(message);
  const errors: Array<{ rule: string; message: string }> = [];
  const warnings: Array<{ rule: string; message: string }> = [];
  const suggestions: string[] = [];
  
  const changedFiles = files.length > 0 ? files : getChangedFiles();
  
  // Valid types and scopes
  const validTypes = [
    'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 
    'test', 'build', 'ci', 'chore', 'revert', 'security', 'format'
  ];
  
  const validScopes = [
    'web', 'docs', 'ui', 'assets', 'config',
    'import', 'geocoding', 'events', 'schema', 'deploy',
    'db', 'api', 'jobs', 'deps', 'seed', 'test',
    'ci', 'build', 'infra'
  ];
  
  // Check type
  if (!parsed.type) {
    errors.push({ rule: 'type-empty', message: 'Type is required' });
  } else if (!validTypes.includes(parsed.type)) {
    errors.push({ 
      rule: 'type-enum', 
      message: `Type "${parsed.type}" is not allowed. Use one of: ${validTypes.join(', ')}` 
    });
  }
  
  // Check scope
  if (parsed.scope && !validScopes.includes(parsed.scope)) {
    errors.push({ 
      rule: 'scope-enum', 
      message: `Scope "${parsed.scope}" is not allowed. Use one of: ${validScopes.join(', ')}` 
    });
  }
  
  // Check scope-file matching
  if (changedFiles.length > 0) {
    const expectedScopes = getExpectedScopes(changedFiles);
    
    if (!parsed.scope && expectedScopes.length > 0) {
      errors.push({
        rule: 'scope-file-match',
        message: `Missing scope. Based on changed files, consider using: ${expectedScopes.join(', ')}`
      });
      suggestions.push(`Try: ${parsed.type}(${expectedScopes[0]}): ${parsed.subject}`);
    } else if (parsed.scope && expectedScopes.length > 0 && !expectedScopes.includes(parsed.scope)) {
      // Special case: 'config' scope should only be used for package configs
      if (parsed.scope === 'config') {
        const configFiles = changedFiles.filter(f => 
          f.includes('packages/') && f.includes('config/')
        );
        if (configFiles.length === 0) {
          errors.push({
            rule: 'scope-file-match',
            message: `Scope "config" should only be used for package configuration changes. Based on your changes, consider: ${expectedScopes.join(', ')}`
          });
        }
      } else if (validScopes.includes(parsed.scope)) {
        warnings.push({
          rule: 'scope-file-match',
          message: `Scope "${parsed.scope}" might not match your changes. Consider using "${expectedScopes[0]}" based on the files modified`
        });
      }
    }
  }
  
  // Check type-scope combinations
  if (parsed.type && parsed.scope) {
    // Prevent redundant type(scope) combinations where type === scope
    // BUT allow docs(docs) which is valid for documentation app changes
    const redundantCombinations: Record<string, string> = {
      'ci': 'Use "ci:" for CI/CD changes, not "ci(ci)"',
      'test': 'Use "test(web):" or "test(docs):" to specify which app\'s tests',
      'build': 'Use "build:" for build system changes, not "build(build)"',
    };
    
    if (parsed.type === parsed.scope && redundantCombinations[parsed.type]) {
      errors.push({
        rule: 'type-scope-combination',
        message: redundantCombinations[parsed.type]
      });
    }
    
    // Only check file-based validations if we have changed files
    if (changedFiles.length > 0) {
      // CI changes should use 'ci' scope when dealing with CI files
      if (parsed.type === 'fix' && parsed.scope === 'config' && 
          changedFiles.some(f => f.includes('.github/') || f.includes('ci/'))) {
        errors.push({
          rule: 'type-scope-combination',
          message: 'For CI/build configuration fixes, use "fix(ci)" or "fix(build)" instead of "fix(config)"'
        });
      }
      
      if (parsed.type === 'chore' && parsed.scope === 'config' && 
          changedFiles.some(f => f.includes('.github/') || f.includes('ci/'))) {
        errors.push({
          rule: 'type-scope-combination',
          message: 'For CI/build configuration updates, use "chore(ci)" or "chore(build)" instead of "chore(config)"'
        });
      }
      
      // Config scope should only be used for package configurations
      if (parsed.scope === 'config' && 
          !changedFiles.some(f => f.includes('packages/') && f.includes('config'))) {
        errors.push({
          rule: 'type-scope-combination',
          message: 'Scope "config" should only be used for configuration package changes (packages/*-config/)'
        });
      }
      
      // Dependencies should use deps scope
      if (parsed.type === 'chore' && parsed.scope === 'web' && 
          changedFiles.some(f => f.endsWith('package.json'))) {
        errors.push({
          rule: 'type-scope-combination',
          message: 'For dependency updates, use "chore(deps)" instead of "chore(web)"'
        });
      }
      
      // Test changes should typically use 'test' type
      if (parsed.type === 'fix' && parsed.scope === 'test') {
        errors.push({
          rule: 'type-scope-combination',
          message: 'For test fixes, use "test(web)" or "test(docs)" instead of "fix(test)"'
        });
      }
    }
  }
  
  // Check subject
  if (!parsed.subject || parsed.subject.trim().length === 0) {
    errors.push({ rule: 'subject-empty', message: 'Subject is required' });
  } else if (parsed.subject.length < 10) {
    errors.push({ rule: 'subject-min-length', message: 'Subject must be at least 10 characters' });
  }
  
  // Check for vague terms
  const vagueTerms = ['stuff', 'things', 'updates', 'changes', 'fixes'];
  const lowerSubject = parsed.subject.toLowerCase();
  for (const term of vagueTerms) {
    if (lowerSubject.includes(term)) {
      warnings.push({
        rule: 'no-vague-subjects',
        message: `Avoid vague terms like "${term}" in commit subjects`
      });
    }
  }
  
  return { parsed, errors, warnings, suggestions };
}

// Test cases
async function runTests(): Promise<boolean> {
  const testCases: TestCase[] = [
    {
      name: 'CI config change with wrong scope',
      message: 'fix(config): update CI workflow',
      files: ['.github/workflows/ci.yml'],
      expectError: true,
      expectedSuggestion: 'ci'
    },
    {
      name: 'Package config change with correct scope',
      message: 'chore(config): update ESLint rules',
      files: ['packages/eslint-config/base.js'],
      expectError: false
    },
    {
      name: 'Web app change with correct scope',
      message: 'feat(web): add new dashboard',
      files: ['apps/web/app/dashboard/page.tsx'],
      expectError: false
    },
    {
      name: 'Import feature change',
      message: 'fix(import): handle CSV parsing edge case',
      files: ['apps/web/app/api/import/upload/route.ts'],
      expectError: false
    },
    {
      name: 'Database migration',
      message: 'feat(db): add new events table index',
      files: ['apps/web/migrations/20250825_add_index.ts'],
      expectError: false
    },
    {
      name: 'Dependency update',
      message: 'chore(deps): update Next.js to v15',
      files: ['apps/web/package.json', 'pnpm-lock.yaml'],
      expectError: false
    },
    {
      name: 'Mixed changes with suggested scope',
      message: 'refactor: improve code structure',
      files: ['apps/web/lib/services/geocoding.ts'],
      expectError: true,
      expectedSuggestion: 'geocoding'
    },
    {
      name: 'Root config changes should use build scope',
      message: 'chore(build): update commitlint config',
      files: ['commitlint.config.mjs'],
      expectError: false
    },
    {
      name: 'CI changes with correct scope',
      message: 'fix(ci): update GitHub Actions workflow',
      files: ['.github/workflows/ci.yml'],
      expectError: false
    }
  ];
  
  console.log(chalk.bold('\n🧪 Running commit message validation tests:\n'));
  
  let passed = 0;
  let failed = 0;
  
  for (const test of testCases) {
    const result = await validateCommit(test.message, test.files);
    const hasErrors = result.errors.length > 0;
    
    if (test.expectError === hasErrors) {
      console.log(chalk.green('✓'), test.name);
      if (test.expectedSuggestion && result.suggestions.length > 0) {
        const suggestedScope = result.suggestions[0].match(/\(([^)]+)\)/)?.[1];
        if (suggestedScope === test.expectedSuggestion) {
          console.log(chalk.gray(`  Correctly suggested scope: ${test.expectedSuggestion}`));
        }
      }
      passed++;
    } else {
      console.log(chalk.red('✗'), test.name);
      console.log(chalk.gray(`  Expected ${test.expectError ? 'error' : 'success'}, got ${hasErrors ? 'error' : 'success'}`));
      if (result.errors.length > 0) {
        result.errors.forEach(e => console.log(chalk.gray(`  - ${e.message}`)));
      }
      failed++;
    }
  }
  
  console.log(chalk.bold(`\n📊 Results: ${passed} passed, ${failed} failed\n`));
  return failed === 0;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--test') {
    const success = await runTests();
    process.exit(success ? 0 : 1);
  }
  
  if (args[0] === '--help' || args.length === 0) {
    console.log(chalk.bold('Commit Message Validator\n'));
    console.log('Usage:');
    console.log('  tsx scripts/validate-commit.ts "commit message"');
    console.log('  tsx scripts/validate-commit.ts --files file1 file2 "commit message"');
    console.log('  tsx scripts/validate-commit.ts --test');
    console.log('\nExamples:');
    console.log('  tsx scripts/validate-commit.ts "feat(web): add new feature"');
    console.log('  tsx scripts/validate-commit.ts --files .github/workflows/ci.yml "fix(ci): update workflow"');
    process.exit(0);
  }
  
  let message = args[args.length - 1];
  let files: string[] = [];
  
  if (args[0] === '--files') {
    files = args.slice(1, -1);
  }
  
  const result = await validateCommit(message, files);
  
  console.log(chalk.bold('\n📝 Commit Message Analysis\n'));
  console.log('Message:', chalk.cyan(message));
  console.log('Parsed:');
  console.log('  Type:', result.parsed.type || chalk.gray('none'));
  console.log('  Scope:', result.parsed.scope || chalk.gray('none'));
  console.log('  Subject:', result.parsed.subject);
  
  if (files.length > 0) {
    console.log('\nFiles:', files.join(', '));
  }
  
  if (result.errors.length > 0) {
    console.log(chalk.red('\n❌ Errors:'));
    result.errors.forEach(e => {
      console.log(chalk.red(`  • [${e.rule}]`), e.message);
    });
  }
  
  if (result.warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    result.warnings.forEach(w => {
      console.log(chalk.yellow(`  • [${w.rule}]`), w.message);
    });
  }
  
  if (result.suggestions.length > 0) {
    console.log(chalk.blue('\n💡 Suggestions:'));
    result.suggestions.forEach(s => {
      console.log(chalk.blue('  •'), s);
    });
  }
  
  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log(chalk.green('\n✅ Commit message is valid!'));
  }
  
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch(console.error);