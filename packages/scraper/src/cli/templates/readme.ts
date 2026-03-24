/**
 * README template for scraper projects.
 *
 * @module
 * @category CLI Templates
 */

export function readmeTemplate(vars: { name: string; runtime: string; entrypoint: string }): string {
  const installStep = vars.runtime === "node" ? "\n2. Install the SDK: `npm install @timetiles/scraper`" : "";

  const testCommand =
    vars.runtime === "python"
      ? `TIMESCRAPE_OUTPUT_DIR=./output python ${vars.entrypoint}`
      : `TIMESCRAPE_OUTPUT_DIR=./output node ${vars.entrypoint}`;

  return `# ${vars.name}

A [TimeTiles](https://docs.timetiles.io) scraper (${vars.runtime}).

## Getting Started

1. Edit \`${vars.entrypoint}\` with your scraping logic${installStep}
3. Push to a git repository and add it as a scraper repo in TimeTiles

## Local Testing

\`\`\`bash
mkdir -p output
${testCommand}
cat output/data.csv
\`\`\`

## Manifest

Edit \`scrapers.yml\` to configure scheduling, resource limits, and additional scrapers.

## Documentation

- [TimeTiles Scraper Guide](https://docs.timetiles.io/reference/scrapers)
- [@timetiles/scraper SDK](https://www.npmjs.com/package/@timetiles/scraper)
`;
}
