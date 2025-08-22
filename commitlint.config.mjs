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
        // Apps & Packages
        'web',        // Next.js web application
        'docs',       // Documentation site
        'ui',         // Shared UI components package
        'assets',     // Shared assets package (logos, images)
        'config',     // Configuration packages (ESLint, TypeScript, etc.)
        
        // Core Features
        'import',     // File import system (manual, scheduled, webhook)
        'geocoding',  // Address geocoding
        'events',     // Event data management
        'schema',     // Schema detection and validation
        'deploy',     // User deployment features (self-hosting, Docker setup)
        
        // Technical Areas
        'db',         // Database, migrations
        'api',        // API endpoints (REST, GraphQL)
        'jobs',       // Background jobs & queues
        'deps',       // Dependencies
        'seed',       // Test and development data generation
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