/**
 * YAML manifest template for scrapers.yml.
 *
 * @module
 * @category CLI Templates
 */

export function manifestTemplate(vars: { name: string; slug: string; runtime: string; entrypoint: string }): string {
  return `# TimeTiles scraper manifest — defines scrapers in this repository.
# See https://docs.timetiles.io/reference/scrapers for documentation.

scrapers:
  - name: "${vars.name}"
    slug: "${vars.slug}"
    runtime: ${vars.runtime}
    entrypoint: ${vars.entrypoint}
    output: data.csv
    # schedule: "0 6 * * *"  # Uncomment to run daily at 6am UTC
    # limits:
    #   timeout: 300
    #   memory: 512
`;
}
