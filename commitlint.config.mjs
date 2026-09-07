import { execSync } from "child_process";

/**
 * Get the list of files changed in the commit
 */
function getChangedFiles() {
  try {
    // For staged changes (during commit)
    const staged = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim().split("\n").filter(Boolean);

    if (staged.length > 0) {
      return staged;
    }

    // For last commit (when validating existing commits)
    return execSync("git diff HEAD~1 --name-only", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch (_error) {
    void _error; // Intentionally ignored — git commands may fail when no commits exist
    return [];
  }
}

/**
 * Single source of truth for allowed commit scopes.
 */
const SCOPES = [
  // Monorepo packages & apps
  "web", // Next.js web application (apps/web)
  "docs", // Documentation site (apps/docs)
  "ui", // Shared UI components package
  "assets", // Shared assets package (logos, images)
  "config", // Configuration changes (Payload, ESLint, TypeScript, Prettier packages, etc.)
  "scraper", // TimeScrape runner and scraper system (apps/timescrape)

  // Core features
  "explore", // Explore page and data exploration UI
  "ingest", // File ingest system (manual, scheduled, webhook) — internal term for "import"
  "geocoding", // Address geocoding services
  "events", // Event data management
  "schema", // Schema detection and validation
  "deploy", // Deployment and self-hosting features
  "quota", // Quota management and rate limiting
  "access", // Access control and permissions
  "cache", // Caching systems (HTTP, URL fetch, etc.)
  "webhooks", // Webhook functionality
  "admin", // Admin panel features
  "auth", // Authentication and user sessions
  "media", // Media and file management
  "charts", // Charts and data visualization
  "map", // Map visualization and clustering

  // Technical areas
  "db", // Database, migrations, PostGIS functions
  "api", // API endpoints (REST)
  "jobs", // Background jobs & queue processing
  "deps", // Dependencies and package management
  "seed", // Test and development data generation
  "test", // Testing infrastructure and test files
  "e2e", // End-to-end tests

  // Infrastructure
  "ci", // GitHub Actions, CI/CD pipelines
  "build", // Docker, build configuration, Turbo
  "infra", // Infrastructure and DevOps
];

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "no-claude-coauthor": (parsed) => {
          const { raw } = parsed;

          // Check for various forms of the Claude co-author
          const claudePatterns = [
            /Co-Authored-By:\s*Claude\s*<noreply@anthropic\.com>/i,
            /Co-authored-by:\s*Claude\s*<noreply@anthropic\.com>/i,
            /🤖\s*Generated with.*Claude/i,
          ];

          for (const pattern of claudePatterns) {
            if (pattern.test(raw)) {
              return [false, "Claude co-author attribution is not allowed in commit messages"];
            }
          }

          return [true];
        },
        "no-vague-subjects": (parsed) => {
          const vague = ["stuff", "things", "updates", "changes", "fixes"];
          const words = parsed.subject?.toLowerCase().match(/[a-z]+/g) || [];
          for (const word of vague) {
            if (words.includes(word)) {
              return [false, `Avoid vague terms like "${word}" in commit subjects`];
            }
          }
          return [true];
        },
        "type-scope-combination": (parsed) => {
          const { type, scope } = parsed;

          // Prevent redundant type(scope) combinations where type === scope
          // BUT allow docs(docs) which is valid for documentation app changes
          const redundantCombinations = {
            ci: 'Use "ci:" for CI/CD changes, not "ci(ci)"',
            test: 'Use "test(web):" or "test(docs):" to specify which app\'s tests',
            build: 'Use "build:" for build system changes, not "build(build)"',
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
              condition:
                type === "fix" &&
                scope === "config" &&
                changedFiles.some((f) => f.includes(".github/") || f.includes("ci/")),
              message: 'For CI/build configuration fixes, use "fix(ci)" or "fix(build)" instead of "fix(config)"',
            },
            {
              condition:
                type === "chore" &&
                scope === "config" &&
                changedFiles.some((f) => f.includes(".github/") || f.includes("ci/")),
              message:
                'For CI/build configuration updates, use "chore(ci)" or "chore(build)" instead of "chore(config)"',
            },
            // Dependencies should use deps scope
            {
              condition: type === "chore" && scope === "web" && changedFiles.some((f) => f.endsWith("package.json")),
              message: 'For dependency updates, use "chore(deps)" instead of "chore(web)"',
            },
            // Test changes should typically use 'test' type
            {
              condition: type === "fix" && scope === "test",
              message: 'For test fixes, use "test(web)" or "test(docs)" instead of "fix(test)"',
            },
          ];

          for (const rule of invalidCombinations) {
            if (rule.condition) {
              return [false, rule.message];
            }
          }

          return [true];
        },
      },
    },
  ],
  rules: {
    "no-claude-coauthor": [2, "always"],
    "subject-min-length": [2, "always", 10],
    "no-vague-subjects": [2, "always"],
    "type-scope-combination": [2, "always"],

    // Type enum - what kind of change
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature for users
        "fix", // Bug fix
        "docs", // Documentation only changes
        "style", // Code style: formatting, missing semicolons, etc
        "format", // Code formatting: whitespace, missing semicolons, etc
        "refactor", // Code change that neither fixes a bug nor adds a feature
        "perf", // Performance improvements
        "test", // Adding or updating tests
        "build", // Build system or external dependencies
        "ci", // CI/CD configuration and scripts
        "chore", // Other changes that don't modify src or test files
        "revert", // Reverts a previous commit
        "security", // Security fixes or improvements
      ],
    ],

    // Scope enum - what part of the codebase (see SCOPES above)
    "scope-enum": [2, "always", SCOPES],

    "scope-empty": [0, "never"], // Scopes are optional.
    "subject-case": [0, "always", ["lower-case", "sentence-case"]],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    "scope-case": [2, "always", "lower-case"],
    "header-max-length": [2, "always", 72],
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
    "body-max-line-length": [2, "always", 100],
  },

  // Help message for scope selection
  prompt: {
    messages: {
      skip: ":skip",
      max: "upper %d chars",
      min: "%d chars at least",
      emptyWarning: "can not be empty",
      upperLimitWarning: "over limit",
      lowerLimitWarning: "below limit",
    },
    questions: {
      type: {
        description: "Select the type of change you're committing",
        enum: {
          feat: { description: "A new feature for users", title: "Features", emoji: "✨" },
          fix: { description: "A bug fix", title: "Bug Fixes", emoji: "🐛" },
          docs: { description: "Documentation only changes", title: "Documentation", emoji: "📚" },
          style: {
            description: "Code style changes (formatting, missing semicolons, etc)",
            title: "Styles",
            emoji: "💎",
          },
          refactor: {
            description: "Code changes that neither fix bugs nor add features",
            title: "Code Refactoring",
            emoji: "📦",
          },
          perf: { description: "Performance improvements", title: "Performance", emoji: "🚀" },
          test: { description: "Adding or updating tests", title: "Tests", emoji: "🚨" },
          build: { description: "Changes to build system or dependencies", title: "Builds", emoji: "🛠" },
          ci: { description: "CI/CD configuration and scripts", title: "CI", emoji: "⚙️" },
          chore: { description: "Other changes that don't affect src or test files", title: "Chores", emoji: "♻️" },
          revert: { description: "Revert a previous commit", title: "Reverts", emoji: "🗑" },
        },
      },
      scope: {
        description: "What is the scope of this change (e.g., component or file name)",
        enum: {
          // Apps & Packages
          web: "Next.js web application",
          docs: "Documentation site",
          ui: "Shared UI components",
          assets: "Shared assets (logos, images)",
          config: "Configuration changes (Payload, ESLint, TypeScript, Prettier)",

          scraper: "TimeScrape runner and scraper system",

          // Features
          explore: "Explore page and data exploration UI",
          ingest: "File ingest system (internal term for import)",
          geocoding: "Geocoding services",
          events: "Event management",
          schema: "Schema detection/validation",
          deploy: "Deployment features",
          quota: "Quota management and rate limiting",
          access: "Access control and permissions",
          cache: "Caching systems",
          webhooks: "Webhook functionality",
          admin: "Admin panel features",
          auth: "Authentication and sessions",
          media: "Media and file management",
          charts: "Charts and data visualization",
          map: "Map visualization and clustering",

          // Technical
          db: "Database and migrations",
          api: "API endpoints",
          jobs: "Background jobs",
          deps: "Dependencies",
          seed: "Test data generation",
          test: "Testing infrastructure",
          e2e: "End-to-end tests",

          // Infrastructure
          ci: "CI/CD pipelines",
          build: "Build configuration",
          infra: "Infrastructure",
        },
      },
    },
  },
};
