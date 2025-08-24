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
        }
      }
    }
  ],
  rules: {
    'no-claude-coauthor': [2, 'always'],
    'subject-min-length': [2, 'always', 10],
    'no-vague-subjects': [2, 'always'],
    // Custom rules based on the TimeTiles commit guidelines
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature for users
        'fix',      // Bug fix
        'docs',     // Documentation only changes
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
        'api',        // API endpoints (REST, GraphQL)
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
    'scope-empty': [1, 'never'],
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
};