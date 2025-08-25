import { execSync } from 'child_process';

/**
 * Get the list of files changed in the commit
 */
function getChangedFiles() {
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

/**
 * Map file paths to expected scopes based on monorepo structure
 */
function getExpectedScopes(files) {
  const scopeMap = {
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
  
  const detectedScopes = new Set();
  
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

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-claude-coauthor': (parsed) => {
          const { raw } = parsed;
          
          // Check for various forms of the Claude co-author
          const claudePatterns = [
            /Co-Authored-By:\s*Claude\s*<noreply@anthropic\.com>/i,
            /Co-authored-by:\s*Claude\s*<noreply@anthropic\.com>/i,
            /🤖\s*Generated with.*Claude/i
          ];
          
          for (const pattern of claudePatterns) {
            if (pattern.test(raw)) {
              return [false, 'Claude co-author attribution is not allowed in commit messages'];
            }
          }
          
          return [true];
        },
        'no-vague-subjects': (parsed) => {
          const vague = ['stuff', 'things', 'updates', 'changes', 'fixes'];
          const subject = parsed.subject?.toLowerCase() || '';
          for (const word of vague) {
            if (subject.includes(word)) {
              return [false, `Avoid vague terms like "${word}" in commit subjects`];
            }
          }
          return [true];
        },
        'scope-file-match': (parsed) => {
          const { scope, type } = parsed;
          
          // Skip validation for certain types that don't need file matching
          if (['revert', 'release'].includes(type)) {
            return [true];
          }
          
          // Get changed files
          const changedFiles = getChangedFiles();
          
          // If we can't detect files (e.g., in CI), skip validation
          if (changedFiles.length === 0) {
            return [true];
          }
          
          // Get expected scopes based on changed files
          const expectedScopes = getExpectedScopes(changedFiles);
          
          // If no scope is provided but files suggest one
          if (!scope && expectedScopes.length > 0) {
            // Allow omitting scope when type matches the expected scope (avoiding redundancy)
            // e.g., "docs: update README" when changing docs files
            // e.g., "ci: fix workflow" when changing CI files
            if (expectedScopes.includes(type)) {
              return [true]; // OK - type already indicates the scope
            }
            
            // For other cases, warn that scope would be helpful
            return [
              1, // Warning level, not error
              `Consider adding scope. Based on changed files: ${expectedScopes.join(', ')}`
            ];
          }
          
          // If scope is provided, check if it matches expected scopes
          if (scope && expectedScopes.length > 0) {
            if (!expectedScopes.includes(scope)) {
              // Special case: 'config' scope should only be used for package configs
              if (scope === 'config') {
                const configFiles = changedFiles.filter(f => 
                  f.includes('packages/') && f.includes('config/')
                );
                if (configFiles.length === 0) {
                  return [
                    false,
                    `Scope "config" should only be used for package configuration changes. Based on your changes, consider: ${expectedScopes.join(', ')}`
                  ];
                }
              }
              
              // Allow the scope if it's in our enum, but provide a suggestion
              const validScopes = [
                'web', 'docs', 'ui', 'assets', 'config',
                'import', 'geocoding', 'events', 'schema', 'deploy',
                'db', 'api', 'jobs', 'deps', 'seed', 'ci', 'build', 'test', 'infra'
              ];
              
              if (validScopes.includes(scope)) {
                // It's a valid scope but might not match the files
                if (expectedScopes.length === 1) {
                  return [
                    1, // Warning level
                    `Scope "${scope}" might not match your changes. Consider using "${expectedScopes[0]}" based on the files modified`
                  ];
                }
              }
            }
          }
          
          return [true];
        },
        'type-scope-combination': (parsed) => {
          const { type, scope } = parsed;
          
          // Prevent redundant type(scope) combinations where type === scope
          // BUT allow docs(docs) which is valid for documentation app changes
          const redundantCombinations = {
            'ci': 'Use "ci:" for CI/CD changes, not "ci(ci)"',
            'test': 'Use "test(web):" or "test(docs):" to specify which app\'s tests',
            'build': 'Use "build:" for build system changes, not "build(build)"',
          };
          
          if (type === scope && redundantCombinations[type]) {
            return [false, redundantCombinations[type]];
          }
          
          // Get changed files to validate scope usage
          const changedFiles = getChangedFiles();
          
          // Skip further validation if we can't detect files (e.g., in CI)
          if (changedFiles.length === 0) {
            return [true];
          }
          
          // Validate common type-scope combinations
          const invalidCombinations = [
            // CI changes should use 'ci' scope when dealing with CI files
            { 
              condition: type === 'fix' && scope === 'config' && 
                        changedFiles.some(f => f.includes('.github/') || f.includes('ci/')),
              message: 'For CI/build configuration fixes, use "fix(ci)" or "fix(build)" instead of "fix(config)"'
            },
            {
              condition: type === 'chore' && scope === 'config' && 
                        changedFiles.some(f => f.includes('.github/') || f.includes('ci/')),
              message: 'For CI/build configuration updates, use "chore(ci)" or "chore(build)" instead of "chore(config)"'
            },
            // Config scope should only be used for package configurations
            {
              condition: scope === 'config' && 
                        !changedFiles.some(f => f.includes('packages/') && f.includes('config')),
              message: 'Scope "config" should only be used for configuration package changes (packages/*-config/)'
            },
            // Dependencies should use deps scope
            {
              condition: type === 'chore' && scope === 'web' && 
                        changedFiles.some(f => f.endsWith('package.json')),
              message: 'For dependency updates, use "chore(deps)" instead of "chore(web)"'
            },
            // Test changes should typically use 'test' type
            {
              condition: type === 'fix' && scope === 'test',
              message: 'For test fixes, use "test(web)" or "test(docs)" instead of "fix(test)"'
            },
          ];
          
          for (const rule of invalidCombinations) {
            if (rule.condition) {
              return [false, rule.message];
            }
          }
          
          return [true];
        }
      }
    }
  ],
  rules: {
    'no-claude-coauthor': [2, 'always'],
    'subject-min-length': [2, 'always', 10],
    'no-vague-subjects': [2, 'always'],
    'scope-file-match': [2, 'always'],
    'type-scope-combination': [2, 'always'],
    
    // Type enum - what kind of change
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature for users
        'fix',      // Bug fix
        'docs',     // Documentation only changes
        'style',    // Code style: formatting, missing semicolons, etc
        'format',   // Code formatting: whitespace, missing semicolons, etc
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf',     // Performance improvements
        'test',     // Adding or updating tests
        'build',    // Build system or external dependencies
        'ci',       // CI/CD configuration and scripts
        'chore',    // Other changes that don't modify src or test files
        'revert',   // Reverts a previous commit
        'security', // Security fixes or improvements
      ],
    ],
    
    // Scope enum - what part of the codebase
    'scope-enum': [
      2,
      'always',
      [
        // Monorepo packages & apps
        'web',        // Next.js web application (apps/web)
        'docs',       // Documentation site (apps/docs)
        'ui',         // Shared UI components package
        'assets',     // Shared assets package (logos, images)
        'config',     // Configuration packages (ESLint, TypeScript, Prettier) - ONLY for packages/*-config/
        
        // Core features
        'import',     // File import system (manual, scheduled, webhook)
        'geocoding',  // Address geocoding services
        'events',     // Event data management
        'schema',     // Schema detection and validation
        'deploy',     // Deployment and self-hosting features
        
        // Technical areas
        'db',         // Database, migrations, PostGIS functions
        'api',        // API endpoints (REST)
        'jobs',       // Background jobs & queue processing
        'deps',       // Dependencies and package management
        'seed',       // Test and development data generation
        'test',       // Testing infrastructure and test files
        
        // Infrastructure
        'ci',         // GitHub Actions, CI/CD pipelines
        'build',      // Docker, build configuration, Turbo
        'infra',      // Infrastructure and DevOps
      ],
    ],
    
    'scope-empty': [0, 'never'], // Disabled - scope-file-match handles this intelligently
    'subject-case': [0, 'always', ['lower-case', 'sentence-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'scope-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],
  },
  
  // Help message for scope selection
  prompt: {
    messages: {
      skip: ':skip',
      max: 'upper %d chars',
      min: '%d chars at least',
      emptyWarning: 'can not be empty',
      upperLimitWarning: 'over limit',
      lowerLimitWarning: 'below limit',
    },
    questions: {
      type: {
        description: "Select the type of change you're committing",
        enum: {
          feat: {
            description: 'A new feature for users',
            title: 'Features',
            emoji: '✨',
          },
          fix: {
            description: 'A bug fix',
            title: 'Bug Fixes',
            emoji: '🐛',
          },
          docs: {
            description: 'Documentation only changes',
            title: 'Documentation',
            emoji: '📚',
          },
          style: {
            description: 'Code style changes (formatting, missing semicolons, etc)',
            title: 'Styles',
            emoji: '💎',
          },
          refactor: {
            description: 'Code changes that neither fix bugs nor add features',
            title: 'Code Refactoring',
            emoji: '📦',
          },
          perf: {
            description: 'Performance improvements',
            title: 'Performance',
            emoji: '🚀',
          },
          test: {
            description: 'Adding or updating tests',
            title: 'Tests',
            emoji: '🚨',
          },
          build: {
            description: 'Changes to build system or dependencies',
            title: 'Builds',
            emoji: '🛠',
          },
          ci: {
            description: 'CI/CD configuration and scripts',
            title: 'CI',
            emoji: '⚙️',
          },
          chore: {
            description: "Other changes that don't affect src or test files",
            title: 'Chores',
            emoji: '♻️',
          },
          revert: {
            description: 'Revert a previous commit',
            title: 'Reverts',
            emoji: '🗑',
          },
        },
      },
      scope: {
        description: 'What is the scope of this change (e.g., component or file name)',
        enum: {
          // Apps & Packages
          web: 'Next.js web application',
          docs: 'Documentation site',
          ui: 'Shared UI components',
          assets: 'Shared assets (logos, images)',
          config: 'Package configurations (ESLint, TypeScript, Prettier)',
          
          // Features
          import: 'File import system',
          geocoding: 'Geocoding services',
          events: 'Event management',
          schema: 'Schema detection/validation',
          deploy: 'Deployment features',
          
          // Technical
          db: 'Database and migrations',
          api: 'API endpoints',
          jobs: 'Background jobs',
          deps: 'Dependencies',
          seed: 'Test data generation',
          test: 'Testing infrastructure',
          
          // Infrastructure
          ci: 'CI/CD pipelines',
          build: 'Build configuration',
          infra: 'Infrastructure',
        },
      },
    },
  },
};