/**
 * README template for scraper projects.
 *
 * @module
 * @category CLI Templates
 */

export function readmeTemplate(vars: { name: string; runtime: string; entrypoint: string }): string {
  const testCommand =
    vars.runtime === "python"
      ? `TIMESCRAPE_OUTPUT_DIR=./output python ${vars.entrypoint}`
      : `TIMESCRAPE_OUTPUT_DIR=./output node ${vars.entrypoint}`;

  return `# ${vars.name}

A [TimeScrape](https://github.com/timetiles/timetiles) scraper (${vars.runtime}).

## Getting Started

1. Edit \`${vars.entrypoint}\` with your scraping logic
2. The scraper should write CSV output to the path specified by \`TIMESCRAPE_OUTPUT_DIR\`
3. Push to a git repository and add it as a scraper repo in TimeTiles

## Local Testing

\`\`\`bash
${testCommand}
\`\`\`

## Manifest

Edit \`scrapers.yml\` to configure scheduling, resource limits, and additional scrapers.
`;
}
