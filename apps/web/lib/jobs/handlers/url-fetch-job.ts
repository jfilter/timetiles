/**
 * Re-exports the URL Fetch Job handler.
 *
 * The actual implementation has been refactored into separate modules
 * in the url-fetch-job directory to improve maintainability.
 *
 * @module
 * @category Jobs
 */

export * from "./url-fetch-job/index";
export { urlFetchJob } from "./url-fetch-job/index";
