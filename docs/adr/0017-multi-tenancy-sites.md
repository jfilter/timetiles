# ADR 0017: Multi-Tenancy and Sites System

## Status

Accepted

## Context

TimeTiles needs to serve multiple branded experiences from a single deployment. A city government might run one instance but expose `events.parks.gov`, `events.library.gov`, and a default portal -- each with distinct logos, color schemes, data scopes, and map configurations. Rather than deploying separate instances per domain, the platform provides a lightweight multi-tenancy model built around two collections: Sites and Views.

## Decision

### Three-Layer Configuration Hierarchy

Branding and display configuration follows a three-layer precedence chain. Each layer overrides the one above it for any field it defines.

| Layer              | Source             | Purpose                                                            |
| ------------------ | ------------------ | ------------------------------------------------------------------ |
| Platform defaults  | `Branding` global  | Site name, description, logos, favicons shared across all sites    |
| Site overrides     | `Sites` collection | Per-domain branding: title, colors, typography, style, custom code |
| View configuration | `Views` collection | Data scope, filters, map settings within a site                    |

The `Branding` global provides localized platform-wide defaults (site name, description, light/dark logos, favicon source images). A Site overrides any subset of these -- title, logo, logoDark, favicon, plus semantic color tokens, font pairing, border radius, and density. Fields left empty on the Site inherit from the Branding global. Views do not carry branding; they inherit the branding of their parent Site.

### Site Collection

A Site represents one branded domain. Key fields:

| Field           | Type          | Purpose                                                                      |
| --------------- | ------------- | ---------------------------------------------------------------------------- |
| `name`          | text          | Internal label                                                               |
| `slug`          | text (unique) | URL-safe identifier                                                          |
| `domain`        | text (unique) | Custom domain for resolution (e.g., `events.city.gov`)                       |
| `isDefault`     | checkbox      | Fallback site when no domain matches (exactly one allowed)                   |
| `branding`      | group         | Title, logos, colors, typography, style overrides                            |
| `customCode`    | group         | HTML/CSS injection (`headHtml`, `bodyStartHtml`, `bodyEndHtml`, `customCSS`) |
| `defaultLayout` | relationship  | Default layout template for pages on this site                               |
| `isPublic`      | checkbox      | Whether the site is publicly accessible                                      |

**Access control:** Site creation is restricted to editors and admins to prevent domain takeover attacks. Domain field changes are restricted to admins only via the `restrictDomainField` hook. Read, update, and delete follow the standard public-ownership pattern.

**Single-default enforcement:** A `beforeChange` hook ensures that at most one site has `isDefault: true`. Setting a new site as default automatically unsets the previous default.

**Auto-created View:** When a new Site is created, an `afterChange` hook automatically creates a default View (`slug: "{site-slug}-default"`) with `isDefault: true`, data scope set to "all", auto-detected filters, and default map settings. This ensures every site has a usable View immediately.

### Domain-to-Site Resolution

The `resolveSite` function determines the active site for each incoming request based on the `Host` header. Resolution follows a strict priority order:

| Priority | Condition                            | Action                                             |
| -------- | ------------------------------------ | -------------------------------------------------- |
| 1        | Host is `localhost` or `127.0.0.1`   | Skip domain lookup entirely                        |
| 2        | Host matches a Site's `domain` field | Return that Site                                   |
| 3        | No domain match                      | Return the default Site (`isDefault: true`)        |
| 4        | No default Site configured           | Return `null` (platform runs without site context) |

Port numbers are stripped before domain comparison (`events.city.gov:8080` matches `events.city.gov`). Only published sites (`_status: "published"`) are considered during resolution.

The resolved Site is passed into `SiteProvider` (React Context) at the layout level. Components access it via the `useSite()` hook, which exposes `site`, `hasSite`, `branding` (with extracted URLs and color tokens), and `customCode`.

### View Resolution Within Sites

Views are scoped to a parent Site via a required `site` relationship field. The `resolveView` function resolves the active View within the already-resolved Site:

| Priority | Condition                                               | Action                                                      |
| -------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| 1        | `?view=slug` query parameter matches a View in the Site | Return that View                                            |
| 2        | No slug match                                           | Return the default View within the Site (`isDefault: true`) |
| 3        | No default View configured                              | Return `null`                                               |

Each View controls:

- **Data scope:** All data, selected catalogs, or selected datasets
- **Filter configuration:** Auto-detected from data, manually configured fields, or disabled
- **Map settings:** Default bounds, zoom, center, base map style, or custom MapLibre style URL
- **Default filters:** Pre-set filter values applied on page load

### Cache Strategy

Both site and view resolvers use a shared `createCachedResolver` factory that provides in-process caching with TTL expiration.

| Parameter            | Value                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| Cache type           | In-process `Map` (two maps per resolver: key cache and default cache)            |
| Default TTL          | 5 minutes                                                                        |
| Cache key format     | `domain` for sites, `{siteId}:{slug}` for views                                  |
| Invalidation trigger | Any site create/update/delete clears the entire site cache                       |
| Manual invalidation  | `clearSiteCache()` and `clearViewCache()` functions                              |
| Negative caching     | Yes -- `null` results are cached to prevent repeated queries for missing domains |
| Query depth          | 1 (resolves one level of relationships)                                          |

The TTL-based expiration works as a sweep: the first lookup after the TTL has elapsed clears both maps entirely, then repopulates on demand. This is simpler than per-entry expiration and sufficient because the site/view data set is small (typically under 20 entries).

Cache invalidation is also triggered eagerly by the `invalidateSiteCache` afterChange hook on the Sites collection, so admin changes take effect within the same request cycle rather than waiting for TTL expiry.

### Custom Code Security

Sites support injecting custom HTML and CSS for analytics scripts, tag managers, and visual customization. All custom code fields are sanitized in a `beforeChange` hook:

- HTML fields (`headHtml`, `bodyStartHtml`, `bodyEndHtml`) pass through `sanitizeHTML`
- CSS fields (`customCSS`) pass through `sanitizeCSS`, which strips `@import`, `url()`, and `javascript:` patterns
- The `customCode` group is restricted to admin-only updates

### Branding Global vs. Site Branding

The Branding global and Site branding serve different purposes and do not conflict at the data layer:

| Aspect       | Branding Global                                | Site Branding                 |
| ------------ | ---------------------------------------------- | ----------------------------- |
| Scope        | Platform-wide defaults                         | Per-domain overrides          |
| Localization | `siteName` and `siteDescription` are localized | Not localized (domain-scoped) |
| Logos        | `logoLight`, `logoDark`                        | `logo`, `logoDark`            |
| Favicons     | Source images that generate multiple sizes     | Single favicon upload         |
| Colors       | None                                           | 15 semantic color tokens      |
| Typography   | None                                           | Font pairing selection        |
| Custom code  | None                                           | HTML and CSS injection        |

The frontend layout is responsible for merging these layers. When a Site defines a title, it takes precedence over the Branding global's `siteName`. When a Site does not define a logo, the Branding global's `logoLight`/`logoDark` are used.

**Reference:** `lib/globals/branding.ts`, `lib/collections/sites/index.ts`, `lib/context/site-context.tsx`

### Display-Only Multi-Site

The multi-site system is designed primarily for display and branding. Custom domains provide distinct visual identities, data scopes, and map configurations — but they do not create independent data silos. All data ingestion (file uploads, scheduled imports, scraper runs) is restricted to the default site. Non-default sites are read-only presentation layers over the shared data set.

This means:

- **Import UI and upload endpoints** are only accessible on the default site
- **Scheduled imports and scraper configurations** are managed through the default site's dashboard
- **Non-default sites** display filtered subsets of data via their Views, but cannot create or modify events
- **Admin operations** (user management, geocoding config, system settings) remain on the default site

This constraint simplifies access control, prevents data ownership ambiguity across domains, and keeps the import pipeline's assumptions (single dataset namespace, shared geocoding config, unified quota tracking) valid without per-site partitioning.

## Consequences

- A single deployment serves multiple custom domains without infrastructure duplication
- In-process caching keeps resolution fast (sub-millisecond for cached lookups) without requiring Redis or external cache infrastructure
- Negative caching prevents repeated database queries for unrecognized domains
- The three-layer hierarchy (Branding -> Site -> View) provides flexible customization while keeping defaults simple
- Domain field restriction to admins prevents non-privileged users from claiming production domains
- Custom code sanitization allows site-specific analytics and styling without exposing XSS vectors
- Auto-created default Views ensure new sites are immediately functional without additional configuration
- The system returns `null` gracefully when no site is configured, allowing the platform to operate without multi-tenancy
