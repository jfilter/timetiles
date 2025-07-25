/* tslint:disable */
/* eslint-disable */
/**
 * This file was automatically generated by Payload.
 * DO NOT MODIFY IT BY HAND. Instead, modify your source Payload config,
 * and re-run `payload generate:types` to regenerate this file.
 */

/**
 * Supported timezones in IANA format.
 *
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "supportedTimezones".
 */
export type SupportedTimezones =
  | 'Pacific/Midway'
  | 'Pacific/Niue'
  | 'Pacific/Honolulu'
  | 'Pacific/Rarotonga'
  | 'America/Anchorage'
  | 'Pacific/Gambier'
  | 'America/Los_Angeles'
  | 'America/Tijuana'
  | 'America/Denver'
  | 'America/Phoenix'
  | 'America/Chicago'
  | 'America/Guatemala'
  | 'America/New_York'
  | 'America/Bogota'
  | 'America/Caracas'
  | 'America/Santiago'
  | 'America/Buenos_Aires'
  | 'America/Sao_Paulo'
  | 'Atlantic/South_Georgia'
  | 'Atlantic/Azores'
  | 'Atlantic/Cape_Verde'
  | 'Europe/London'
  | 'Europe/Berlin'
  | 'Africa/Lagos'
  | 'Europe/Athens'
  | 'Africa/Cairo'
  | 'Europe/Moscow'
  | 'Asia/Riyadh'
  | 'Asia/Dubai'
  | 'Asia/Baku'
  | 'Asia/Karachi'
  | 'Asia/Tashkent'
  | 'Asia/Calcutta'
  | 'Asia/Dhaka'
  | 'Asia/Almaty'
  | 'Asia/Jakarta'
  | 'Asia/Bangkok'
  | 'Asia/Shanghai'
  | 'Asia/Singapore'
  | 'Asia/Tokyo'
  | 'Asia/Seoul'
  | 'Australia/Brisbane'
  | 'Australia/Sydney'
  | 'Pacific/Guam'
  | 'Pacific/Noumea'
  | 'Pacific/Auckland'
  | 'Pacific/Fiji';

export interface Config {
  auth: {
    users: UserAuthOperations;
  };
  blocks: {};
  collections: {
    catalogs: Catalog;
    datasets: Dataset;
    imports: Import;
    events: Event;
    users: User;
    media: Media;
    'location-cache': LocationCache;
    'geocoding-providers': GeocodingProvider;
    pages: Page;
    'payload-jobs': PayloadJob;
    'payload-locked-documents': PayloadLockedDocument;
    'payload-preferences': PayloadPreference;
    'payload-migrations': PayloadMigration;
  };
  collectionsJoins: {};
  collectionsSelect: {
    catalogs: CatalogsSelect<false> | CatalogsSelect<true>;
    datasets: DatasetsSelect<false> | DatasetsSelect<true>;
    imports: ImportsSelect<false> | ImportsSelect<true>;
    events: EventsSelect<false> | EventsSelect<true>;
    users: UsersSelect<false> | UsersSelect<true>;
    media: MediaSelect<false> | MediaSelect<true>;
    'location-cache': LocationCacheSelect<false> | LocationCacheSelect<true>;
    'geocoding-providers': GeocodingProvidersSelect<false> | GeocodingProvidersSelect<true>;
    pages: PagesSelect<false> | PagesSelect<true>;
    'payload-jobs': PayloadJobsSelect<false> | PayloadJobsSelect<true>;
    'payload-locked-documents': PayloadLockedDocumentsSelect<false> | PayloadLockedDocumentsSelect<true>;
    'payload-preferences': PayloadPreferencesSelect<false> | PayloadPreferencesSelect<true>;
    'payload-migrations': PayloadMigrationsSelect<false> | PayloadMigrationsSelect<true>;
  };
  db: {
    defaultIDType: number;
  };
  globals: {
    'main-menu': MainMenu;
  };
  globalsSelect: {
    'main-menu': MainMenuSelect<false> | MainMenuSelect<true>;
  };
  locale: null;
  user: User & {
    collection: 'users';
  };
  jobs: {
    tasks: {
      'file-parsing': TaskFileParsing;
      'batch-processing': TaskBatchProcessing;
      'event-creation': TaskEventCreation;
      'geocoding-batch': TaskGeocodingBatch;
      inline: {
        input: unknown;
        output: unknown;
      };
    };
    workflows: unknown;
  };
}
export interface UserAuthOperations {
  forgotPassword: {
    email: string;
    password: string;
  };
  login: {
    email: string;
    password: string;
  };
  registerFirstUser: {
    email: string;
    password: string;
  };
  unlock: {
    email: string;
    password: string;
  };
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "catalogs".
 */
export interface Catalog {
  id: number;
  name: string;
  description?: {
    root: {
      type: string;
      children: {
        type: string;
        version: number;
        [k: string]: unknown;
      }[];
      direction: ('ltr' | 'rtl') | null;
      format: 'left' | 'start' | 'center' | 'right' | 'end' | 'justify' | '';
      indent: number;
      version: number;
    };
    [k: string]: unknown;
  } | null;
  /**
   * URL-friendly identifier (auto-generated from name if not provided)
   */
  slug?: string | null;
  status?: ('active' | 'archived') | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "datasets".
 */
export interface Dataset {
  id: number;
  name: string;
  description?: {
    root: {
      type: string;
      children: {
        type: string;
        version: number;
        [k: string]: unknown;
      }[];
      direction: ('ltr' | 'rtl') | null;
      format: 'left' | 'start' | 'center' | 'right' | 'end' | 'justify' | '';
      indent: number;
      version: number;
    };
    [k: string]: unknown;
  } | null;
  slug?: string | null;
  catalog: number | Catalog;
  /**
   * ISO-639 3 letter code (e.g., eng, deu, fra)
   */
  language: string;
  status?: ('draft' | 'active' | 'archived') | null;
  isPublic?: boolean | null;
  /**
   * JSON schema definition for this dataset
   */
  schema:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  /**
   * Additional metadata for the dataset
   */
  metadata?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "imports".
 */
export interface Import {
  id: number;
  /**
   * System file name
   */
  fileName: string;
  /**
   * Original user-friendly file name
   */
  originalName?: string | null;
  catalog: number | Catalog;
  /**
   * File size in bytes
   */
  fileSize?: number | null;
  /**
   * MIME type of the uploaded file
   */
  mimeType?: string | null;
  /**
   * User who initiated the import (null for unauthenticated)
   */
  user?: (number | null) | User;
  /**
   * Session ID for unauthenticated users
   */
  sessionId?: string | null;
  status?: ('pending' | 'processing' | 'completed' | 'failed') | null;
  /**
   * Current processing stage
   */
  processingStage?: ('file-parsing' | 'row-processing' | 'geocoding' | 'event-creation' | 'completed') | null;
  importedAt?: string | null;
  completedAt?: string | null;
  /**
   * Total number of rows processed
   */
  rowCount: number;
  /**
   * Number of rows that failed processing
   */
  errorCount?: number | null;
  /**
   * Detailed error information
   */
  errorLog?: string | null;
  /**
   * Rate limiting information for this import
   */
  rateLimitInfo?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  /**
   * Additional import context and metadata
   */
  metadata?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  /**
   * Processing progress tracking
   */
  progress?: {
    /**
     * Total number of rows to process
     */
    totalRows?: number | null;
    /**
     * Number of rows processed
     */
    processedRows?: number | null;
    /**
     * Number of rows geocoded
     */
    geocodedRows?: number | null;
    /**
     * Number of events created
     */
    createdEvents?: number | null;
    /**
     * Overall completion percentage
     */
    percentage?: number | null;
  };
  /**
   * Batch processing information
   */
  batchInfo?: {
    /**
     * Number of rows per batch
     */
    batchSize?: number | null;
    /**
     * Current batch being processed
     */
    currentBatch?: number | null;
    /**
     * Total number of batches
     */
    totalBatches?: number | null;
  };
  /**
   * Geocoding statistics
   */
  geocodingStats?: {
    /**
     * Total addresses to geocode
     */
    totalAddresses?: number | null;
    /**
     * Successfully geocoded addresses
     */
    successfulGeocodes?: number | null;
    /**
     * Failed geocoding attempts
     */
    failedGeocodes?: number | null;
    /**
     * Results from cache
     */
    cachedResults?: number | null;
    /**
     * Google Maps API calls made
     */
    googleApiCalls?: number | null;
    /**
     * Nominatim API calls made
     */
    nominatimApiCalls?: number | null;
    /**
     * Rows with coordinates from import
     */
    preExistingCoordinates?: number | null;
    /**
     * Rows where geocoding was skipped
     */
    skippedGeocoding?: number | null;
  };
  /**
   * Current Payload job ID being processed
   */
  currentJobId?: string | null;
  /**
   * History of all jobs for this import
   */
  jobHistory?:
    | {
        /**
         * Payload job ID
         */
        jobId: string;
        jobType: 'file-parsing' | 'batch-processing' | 'geocoding-batch' | 'event-creation';
        status: 'queued' | 'running' | 'completed' | 'failed';
        startedAt?: string | null;
        completedAt?: string | null;
        /**
         * Error message if job failed
         */
        error?: string | null;
        /**
         * Job result data
         */
        result?:
          | {
              [k: string]: unknown;
            }
          | unknown[]
          | string
          | number
          | boolean
          | null;
        id?: string | null;
      }[]
    | null;
  /**
   * Coordinate column detection information
   */
  coordinateDetection?: {
    /**
     * Were coordinate columns detected in the import?
     */
    detected?: boolean | null;
    detectionMethod?: ('pattern' | 'heuristic' | 'manual' | 'none') | null;
    columnMapping?: {
      latitudeColumn?: string | null;
      longitudeColumn?: string | null;
      combinedColumn?: string | null;
      coordinateFormat?: ('decimal' | 'dms' | 'combined_comma' | 'combined_space' | 'geojson') | null;
    };
    /**
     * Confidence in coordinate detection (0-1)
     */
    detectionConfidence?: number | null;
    sampleValidation?: {
      validSamples?: number | null;
      invalidSamples?: number | null;
      /**
       * Were lat/lon likely swapped?
       */
      swappedCoordinates?: boolean | null;
    };
  };
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "users".
 */
export interface User {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  role?: ('user' | 'admin' | 'analyst') | null;
  isActive?: boolean | null;
  lastLoginAt?: string | null;
  updatedAt: string;
  createdAt: string;
  email: string;
  resetPasswordToken?: string | null;
  resetPasswordExpiration?: string | null;
  salt?: string | null;
  hash?: string | null;
  loginAttempts?: number | null;
  lockUntil?: string | null;
  sessions?:
    | {
        id: string;
        createdAt?: string | null;
        expiresAt: string;
      }[]
    | null;
  password?: string | null;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "events".
 */
export interface Event {
  id: number;
  dataset: number | Dataset;
  /**
   * The import that created this event
   */
  import?: (number | null) | Import;
  /**
   * Event data in JSON format
   */
  data:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  /**
   * Geographic coordinates (WGS84)
   */
  location?: {
    latitude?: number | null;
    longitude?: number | null;
  };
  /**
   * Source and validation of coordinate data
   */
  coordinateSource?: {
    type?: ('import' | 'geocoded' | 'manual' | 'none') | null;
    importColumns?: {
      /**
       * Column name containing latitude
       */
      latitudeColumn?: string | null;
      /**
       * Column name containing longitude
       */
      longitudeColumn?: string | null;
      /**
       * Column name if coordinates were combined
       */
      combinedColumn?: string | null;
      /**
       * Format of coordinates (decimal, DMS, etc.)
       */
      format?: string | null;
    };
    /**
     * Confidence in coordinate accuracy (0-1)
     */
    confidence?: number | null;
    validationStatus?: ('valid' | 'out_of_range' | 'suspicious_zero' | 'swapped' | 'invalid') | null;
  };
  /**
   * When the actual event occurred
   */
  eventTimestamp?: string | null;
  /**
   * Whether this event passed validation
   */
  isValid?: boolean | null;
  /**
   * Validation errors if any
   */
  validationErrors?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  /**
   * Geocoding metadata and information
   */
  geocodingInfo?: {
    /**
     * Original address string from import
     */
    originalAddress?: string | null;
    /**
     * Geocoding provider used
     */
    provider?: ('google' | 'nominatim' | 'manual') | null;
    /**
     * Geocoding confidence score (0-1)
     */
    confidence?: number | null;
    /**
     * Normalized address returned by geocoder
     */
    normalizedAddress?: string | null;
  };
  /**
   * URL-friendly identifier (auto-generated from event title if not provided)
   */
  slug?: string | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "media".
 */
export interface Media {
  id: number;
  /**
   * Alternative text for accessibility
   */
  alt?: string | null;
  updatedAt: string;
  createdAt: string;
  url?: string | null;
  thumbnailURL?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  filesize?: number | null;
  width?: number | null;
  height?: number | null;
  focalX?: number | null;
  focalY?: number | null;
  sizes?: {
    thumbnail?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    card?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
    tablet?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
      mimeType?: string | null;
      filesize?: number | null;
      filename?: string | null;
    };
  };
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "location-cache".
 */
export interface LocationCache {
  id: number;
  /**
   * Original address string
   */
  originalAddress: string;
  /**
   * Normalized address for better matching
   */
  normalizedAddress: string;
  /**
   * Latitude coordinate (WGS84)
   */
  latitude: number;
  /**
   * Longitude coordinate (WGS84)
   */
  longitude: number;
  /**
   * Name of the geocoding provider used
   */
  provider: string;
  /**
   * Confidence score (0-1)
   */
  confidence?: number | null;
  /**
   * Number of times this cached result was used
   */
  hitCount?: number | null;
  /**
   * Last time this cached result was accessed
   */
  lastUsed?: string | null;
  /**
   * Parsed address components
   */
  components?: {
    /**
     * Street number
     */
    streetNumber?: string | null;
    /**
     * Street name
     */
    streetName?: string | null;
    /**
     * City name
     */
    city?: string | null;
    /**
     * State/Region/Province
     */
    region?: string | null;
    /**
     * Postal/ZIP code
     */
    postalCode?: string | null;
    /**
     * Country name
     */
    country?: string | null;
  };
  /**
   * Additional provider-specific metadata
   */
  metadata?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * Manage geocoding provider configurations
 *
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "geocoding-providers".
 */
export interface GeocodingProvider {
  id: number;
  /**
   * Unique name for this provider instance (e.g., 'Google Primary', 'Nominatim EU')
   */
  name: string;
  /**
   * The geocoding service provider
   */
  type: 'google' | 'nominatim' | 'opencage';
  /**
   * Enable this provider instance
   */
  enabled?: boolean | null;
  /**
   * Provider priority (1 = highest priority, 1000 = lowest)
   */
  priority: number;
  /**
   * Maximum requests per second for this provider
   */
  rateLimit?: number | null;
  /**
   * Provider-specific settings
   */
  config?: {
    google?: {
      /**
       * Google Maps Geocoding API key
       */
      apiKey: string;
      /**
       * ISO 3166-1 alpha-2 country code for result bias (e.g., 'US', 'GB')
       */
      region?: string | null;
      /**
       * Language for returned results (e.g., 'en', 'de', 'fr')
       */
      language?: string | null;
    };
    nominatim?: {
      /**
       * Nominatim server URL
       */
      baseUrl: string;
      /**
       * User agent string for requests (required by Nominatim policy)
       */
      userAgent: string;
      /**
       * Contact email for high-volume usage (recommended)
       */
      email?: string | null;
      /**
       * Comma-separated ISO 3166-1 alpha-2 codes to limit results (e.g., 'us,ca,gb')
       */
      countrycodes?: string | null;
      /**
       * Include detailed address components in results
       */
      addressdetails?: boolean | null;
      /**
       * Include additional OSM tags in results
       */
      extratags?: boolean | null;
    };
    opencage?: {
      /**
       * OpenCage Geocoding API key
       */
      apiKey: string;
      /**
       * ISO 639-1 language code for results (e.g., 'en', 'de', 'fr')
       */
      language?: string | null;
      /**
       * ISO 3166-1 alpha-2 country code to restrict results (e.g., 'US', 'DE')
       */
      countrycode?: string | null;
      /**
       * Restrict results to a specific geographic area
       */
      bounds?: {
        enabled?: boolean | null;
        southwest?: {
          lat?: number | null;
          lng?: number | null;
        };
        northeast?: {
          lat?: number | null;
          lng?: number | null;
        };
      };
      /**
       * Include additional metadata like timezone, currency, etc.
       */
      annotations?: boolean | null;
      /**
       * Abbreviate street names and components
       */
      abbrv?: boolean | null;
    };
  };
  /**
   * Tags for organizing and filtering providers
   */
  tags?:
    | (
        | 'production'
        | 'development'
        | 'testing'
        | 'backup'
        | 'primary'
        | 'secondary'
        | 'region-us'
        | 'region-eu'
        | 'region-asia'
        | 'region-global'
        | 'high-volume'
        | 'low-volume'
        | 'free-tier'
        | 'paid-tier'
      )[]
    | null;
  /**
   * Provider usage statistics (automatically updated)
   */
  statistics?: {
    totalRequests?: number | null;
    successfulRequests?: number | null;
    failedRequests?: number | null;
    lastUsed?: string | null;
    averageResponseTime?: number | null;
  };
  /**
   * Internal notes about this provider instance
   */
  notes?: string | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "pages".
 */
export interface Page {
  id: number;
  title: string;
  slug: string;
  content?: {
    root: {
      type: string;
      children: {
        type: string;
        version: number;
        [k: string]: unknown;
      }[];
      direction: ('ltr' | 'rtl') | null;
      format: 'left' | 'start' | 'center' | 'right' | 'end' | 'justify' | '';
      indent: number;
      version: number;
    };
    [k: string]: unknown;
  } | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-jobs".
 */
export interface PayloadJob {
  id: number;
  /**
   * Input data provided to the job
   */
  input?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  taskStatus?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  completedAt?: string | null;
  totalTried?: number | null;
  /**
   * If hasError is true this job will not be retried
   */
  hasError?: boolean | null;
  /**
   * If hasError is true, this is the error that caused it
   */
  error?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  /**
   * Task execution log
   */
  log?:
    | {
        executedAt: string;
        completedAt: string;
        taskSlug: 'inline' | 'file-parsing' | 'batch-processing' | 'event-creation' | 'geocoding-batch';
        taskID: string;
        input?:
          | {
              [k: string]: unknown;
            }
          | unknown[]
          | string
          | number
          | boolean
          | null;
        output?:
          | {
              [k: string]: unknown;
            }
          | unknown[]
          | string
          | number
          | boolean
          | null;
        state: 'failed' | 'succeeded';
        error?:
          | {
              [k: string]: unknown;
            }
          | unknown[]
          | string
          | number
          | boolean
          | null;
        id?: string | null;
      }[]
    | null;
  taskSlug?: ('inline' | 'file-parsing' | 'batch-processing' | 'event-creation' | 'geocoding-batch') | null;
  queue?: string | null;
  waitUntil?: string | null;
  processing?: boolean | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-locked-documents".
 */
export interface PayloadLockedDocument {
  id: number;
  document?:
    | ({
        relationTo: 'catalogs';
        value: number | Catalog;
      } | null)
    | ({
        relationTo: 'datasets';
        value: number | Dataset;
      } | null)
    | ({
        relationTo: 'imports';
        value: number | Import;
      } | null)
    | ({
        relationTo: 'events';
        value: number | Event;
      } | null)
    | ({
        relationTo: 'users';
        value: number | User;
      } | null)
    | ({
        relationTo: 'media';
        value: number | Media;
      } | null)
    | ({
        relationTo: 'location-cache';
        value: number | LocationCache;
      } | null)
    | ({
        relationTo: 'geocoding-providers';
        value: number | GeocodingProvider;
      } | null)
    | ({
        relationTo: 'pages';
        value: number | Page;
      } | null)
    | ({
        relationTo: 'payload-jobs';
        value: number | PayloadJob;
      } | null);
  globalSlug?: string | null;
  user: {
    relationTo: 'users';
    value: number | User;
  };
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-preferences".
 */
export interface PayloadPreference {
  id: number;
  user: {
    relationTo: 'users';
    value: number | User;
  };
  key?: string | null;
  value?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-migrations".
 */
export interface PayloadMigration {
  id: number;
  name?: string | null;
  batch?: number | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "catalogs_select".
 */
export interface CatalogsSelect<T extends boolean = true> {
  name?: T;
  description?: T;
  slug?: T;
  status?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "datasets_select".
 */
export interface DatasetsSelect<T extends boolean = true> {
  name?: T;
  description?: T;
  slug?: T;
  catalog?: T;
  language?: T;
  status?: T;
  isPublic?: T;
  schema?: T;
  metadata?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "imports_select".
 */
export interface ImportsSelect<T extends boolean = true> {
  fileName?: T;
  originalName?: T;
  catalog?: T;
  fileSize?: T;
  mimeType?: T;
  user?: T;
  sessionId?: T;
  status?: T;
  processingStage?: T;
  importedAt?: T;
  completedAt?: T;
  rowCount?: T;
  errorCount?: T;
  errorLog?: T;
  rateLimitInfo?: T;
  metadata?: T;
  progress?:
    | T
    | {
        totalRows?: T;
        processedRows?: T;
        geocodedRows?: T;
        createdEvents?: T;
        percentage?: T;
      };
  batchInfo?:
    | T
    | {
        batchSize?: T;
        currentBatch?: T;
        totalBatches?: T;
      };
  geocodingStats?:
    | T
    | {
        totalAddresses?: T;
        successfulGeocodes?: T;
        failedGeocodes?: T;
        cachedResults?: T;
        googleApiCalls?: T;
        nominatimApiCalls?: T;
        preExistingCoordinates?: T;
        skippedGeocoding?: T;
      };
  currentJobId?: T;
  jobHistory?:
    | T
    | {
        jobId?: T;
        jobType?: T;
        status?: T;
        startedAt?: T;
        completedAt?: T;
        error?: T;
        result?: T;
        id?: T;
      };
  coordinateDetection?:
    | T
    | {
        detected?: T;
        detectionMethod?: T;
        columnMapping?:
          | T
          | {
              latitudeColumn?: T;
              longitudeColumn?: T;
              combinedColumn?: T;
              coordinateFormat?: T;
            };
        detectionConfidence?: T;
        sampleValidation?:
          | T
          | {
              validSamples?: T;
              invalidSamples?: T;
              swappedCoordinates?: T;
            };
      };
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "events_select".
 */
export interface EventsSelect<T extends boolean = true> {
  dataset?: T;
  import?: T;
  data?: T;
  location?:
    | T
    | {
        latitude?: T;
        longitude?: T;
      };
  coordinateSource?:
    | T
    | {
        type?: T;
        importColumns?:
          | T
          | {
              latitudeColumn?: T;
              longitudeColumn?: T;
              combinedColumn?: T;
              format?: T;
            };
        confidence?: T;
        validationStatus?: T;
      };
  eventTimestamp?: T;
  isValid?: T;
  validationErrors?: T;
  geocodingInfo?:
    | T
    | {
        originalAddress?: T;
        provider?: T;
        confidence?: T;
        normalizedAddress?: T;
      };
  slug?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "users_select".
 */
export interface UsersSelect<T extends boolean = true> {
  firstName?: T;
  lastName?: T;
  role?: T;
  isActive?: T;
  lastLoginAt?: T;
  updatedAt?: T;
  createdAt?: T;
  email?: T;
  resetPasswordToken?: T;
  resetPasswordExpiration?: T;
  salt?: T;
  hash?: T;
  loginAttempts?: T;
  lockUntil?: T;
  sessions?:
    | T
    | {
        id?: T;
        createdAt?: T;
        expiresAt?: T;
      };
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "media_select".
 */
export interface MediaSelect<T extends boolean = true> {
  alt?: T;
  updatedAt?: T;
  createdAt?: T;
  url?: T;
  thumbnailURL?: T;
  filename?: T;
  mimeType?: T;
  filesize?: T;
  width?: T;
  height?: T;
  focalX?: T;
  focalY?: T;
  sizes?:
    | T
    | {
        thumbnail?:
          | T
          | {
              url?: T;
              width?: T;
              height?: T;
              mimeType?: T;
              filesize?: T;
              filename?: T;
            };
        card?:
          | T
          | {
              url?: T;
              width?: T;
              height?: T;
              mimeType?: T;
              filesize?: T;
              filename?: T;
            };
        tablet?:
          | T
          | {
              url?: T;
              width?: T;
              height?: T;
              mimeType?: T;
              filesize?: T;
              filename?: T;
            };
      };
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "location-cache_select".
 */
export interface LocationCacheSelect<T extends boolean = true> {
  originalAddress?: T;
  normalizedAddress?: T;
  latitude?: T;
  longitude?: T;
  provider?: T;
  confidence?: T;
  hitCount?: T;
  lastUsed?: T;
  components?:
    | T
    | {
        streetNumber?: T;
        streetName?: T;
        city?: T;
        region?: T;
        postalCode?: T;
        country?: T;
      };
  metadata?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "geocoding-providers_select".
 */
export interface GeocodingProvidersSelect<T extends boolean = true> {
  name?: T;
  type?: T;
  enabled?: T;
  priority?: T;
  rateLimit?: T;
  config?:
    | T
    | {
        google?:
          | T
          | {
              apiKey?: T;
              region?: T;
              language?: T;
            };
        nominatim?:
          | T
          | {
              baseUrl?: T;
              userAgent?: T;
              email?: T;
              countrycodes?: T;
              addressdetails?: T;
              extratags?: T;
            };
        opencage?:
          | T
          | {
              apiKey?: T;
              language?: T;
              countrycode?: T;
              bounds?:
                | T
                | {
                    enabled?: T;
                    southwest?:
                      | T
                      | {
                          lat?: T;
                          lng?: T;
                        };
                    northeast?:
                      | T
                      | {
                          lat?: T;
                          lng?: T;
                        };
                  };
              annotations?: T;
              abbrv?: T;
            };
      };
  tags?: T;
  statistics?:
    | T
    | {
        totalRequests?: T;
        successfulRequests?: T;
        failedRequests?: T;
        lastUsed?: T;
        averageResponseTime?: T;
      };
  notes?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "pages_select".
 */
export interface PagesSelect<T extends boolean = true> {
  title?: T;
  slug?: T;
  content?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-jobs_select".
 */
export interface PayloadJobsSelect<T extends boolean = true> {
  input?: T;
  taskStatus?: T;
  completedAt?: T;
  totalTried?: T;
  hasError?: T;
  error?: T;
  log?:
    | T
    | {
        executedAt?: T;
        completedAt?: T;
        taskSlug?: T;
        taskID?: T;
        input?: T;
        output?: T;
        state?: T;
        error?: T;
        id?: T;
      };
  taskSlug?: T;
  queue?: T;
  waitUntil?: T;
  processing?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-locked-documents_select".
 */
export interface PayloadLockedDocumentsSelect<T extends boolean = true> {
  document?: T;
  globalSlug?: T;
  user?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-preferences_select".
 */
export interface PayloadPreferencesSelect<T extends boolean = true> {
  user?: T;
  key?: T;
  value?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-migrations_select".
 */
export interface PayloadMigrationsSelect<T extends boolean = true> {
  name?: T;
  batch?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "main-menu".
 */
export interface MainMenu {
  id: number;
  navItems?:
    | {
        label: string;
        url: string;
        id?: string | null;
      }[]
    | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "main-menu_select".
 */
export interface MainMenuSelect<T extends boolean = true> {
  navItems?:
    | T
    | {
        label?: T;
        url?: T;
        id?: T;
      };
  updatedAt?: T;
  createdAt?: T;
  globalType?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "TaskFile-parsing".
 */
export interface TaskFileParsing {
  input?: unknown;
  output?: unknown;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "TaskBatch-processing".
 */
export interface TaskBatchProcessing {
  input?: unknown;
  output?: unknown;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "TaskEvent-creation".
 */
export interface TaskEventCreation {
  input?: unknown;
  output?: unknown;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "TaskGeocoding-batch".
 */
export interface TaskGeocodingBatch {
  input?: unknown;
  output?: unknown;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "auth".
 */
export interface Auth {
  [k: string]: unknown;
}


declare module 'payload' {
  export interface GeneratedTypes extends Config {}
}