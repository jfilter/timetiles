/**
 * Route prefixes shared between the Payload configuration and the code that
 * links into it.
 *
 * @module
 * @category Constants
 */

/**
 * Where the Payload dashboard is mounted.
 *
 * Payload's own default is `/admin`; this project overrides it. Anything
 * building a link into the dashboard has to agree with the override, and
 * hardcoding the default is silent — the link simply 404s wherever it was
 * sent. Scheduled-ingest alert emails did exactly that.
 */
export const ADMIN_ROUTE = "/dashboard";

/** Build a link to a collection document in the Payload dashboard. */
export const adminCollectionUrl = (baseUrl: string, collectionSlug: string, id: number | string): string =>
  `${baseUrl.replace(/\/$/, "")}${ADMIN_ROUTE}/collections/${collectionSlug}/${id}`;
