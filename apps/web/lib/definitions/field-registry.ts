/**
 * Canonical registry for event field definitions.
 *
 * This is the single source of truth for:
 * - The core event fields (title, date, location, etc.)
 * - Their naming conventions across the codebase:
 *   - `fieldName` — used in the ingest wizard UI (`titleField`, `dateField`)
 *   - `pathName` — used in schema detection and data packages (`titlePath`, `timestampPath`)
 * - UI metadata (label, icon, required, description)
 *
 * All other modules derive their field lists and types from here.
 *
 * @module
 * @category Definitions
 */

// ---------------------------------------------------------------------------
// Event field definitions
// ---------------------------------------------------------------------------

/**
 * The canonical list of event fields.
 *
 * Each entry maps between the wizard UI naming (`*Field`), the detection/package
 * naming (`*Path`), and carries UI metadata.
 *
 * `pathName: null` means the field has no corresponding `*Path` variant
 * (e.g. the ID field is wizard-only).
 */
export const EVENT_FIELD_DEFINITIONS = [
  {
    key: "title",
    pathName: "titlePath",
    fieldName: "titleField",
    label: "Title",
    icon: "Text",
    required: true,
    description: "The main title or name of the event",
  },
  {
    key: "timestamp",
    pathName: "timestampPath",
    fieldName: "dateField",
    label: "Date",
    icon: "Calendar",
    required: true,
    description: "When the event occurs",
  },
  {
    key: "location",
    pathName: "locationPath",
    fieldName: "locationField",
    label: "Location",
    icon: "MapPin",
    required: false,
    description: "Address or location description for geocoding",
  },
  {
    key: "latitude",
    pathName: "latitudePath",
    fieldName: "latitudeField",
    label: "Latitude",
    icon: "MapPin",
    required: false,
    description: "Geographic latitude coordinate",
  },
  {
    key: "longitude",
    pathName: "longitudePath",
    fieldName: "longitudeField",
    label: "Longitude",
    icon: "MapPin",
    required: false,
    description: "Geographic longitude coordinate",
  },
  {
    key: "description",
    pathName: "descriptionPath",
    fieldName: "descriptionField",
    label: "Description",
    icon: "FileText",
    required: false,
    description: "Detailed description of the event",
  },
  {
    key: "locationName",
    pathName: "locationNamePath",
    fieldName: "locationNameField",
    label: "Location Name",
    icon: "Building",
    required: false,
    description: "Name of the venue or place",
  },
  {
    key: "endTimestamp",
    pathName: "endTimestampPath",
    fieldName: "endDateField",
    label: "End Date",
    icon: "Calendar",
    required: false,
    description: "When the event ends",
  },
  {
    key: "id",
    pathName: null,
    fieldName: "idField",
    label: "ID Field",
    icon: "Hash",
    required: false,
    description: "External identifier for deduplication",
  },
] as const;

export type EventFieldDefinition = (typeof EVENT_FIELD_DEFINITIONS)[number];

/** Union of all event field keys (e.g. "title" | "timestamp" | ...) */
export type EventFieldKey = EventFieldDefinition["key"];

// ---------------------------------------------------------------------------
// Derived types for path-based interfaces
// ---------------------------------------------------------------------------

/** Entries that have a `pathName` (excludes id which has pathName: null). */
type PathFieldDefinition = Extract<EventFieldDefinition, { pathName: string }>;

/**
 * Flat field mappings using `*Path` naming.
 *
 * Equivalent to the old hand-written `FieldMappings` and `DataPackageFieldMappings`
 * interfaces — now derived from the single registry.
 */
export type FieldPathMappings = {
  [K in PathFieldDefinition as K["pathName"]]: string | null;
};

// ---------------------------------------------------------------------------
// Derived arrays for UI consumption
// ---------------------------------------------------------------------------

/** Entries that appear in the visual flow editor (excludes endTimestamp which has no flow node). */
const FLOW_EDITOR_EXCLUDED_KEYS = new Set<EventFieldKey>(["endTimestamp"]);

/**
 * Field definitions for the visual flow editor's target nodes.
 *
 * Filters out fields that don't appear in the flow editor (e.g. endTimestamp)
 * and maps `fieldName` to `fieldKey` for xyflow node compatibility.
 */
export const getTargetFieldDefinitions = () =>
  EVENT_FIELD_DEFINITIONS.filter((def) => !FLOW_EDITOR_EXCLUDED_KEYS.has(def.key)).map((def) => ({
    fieldKey: def.fieldName,
    label: def.label,
    icon: def.icon,
    required: def.required,
    description: def.description,
  }));

/**
 * All path names from the registry (for building SuggestedMappings, etc.).
 */
export const EVENT_FIELD_PATH_NAMES = EVENT_FIELD_DEFINITIONS.filter(
  (d): d is PathFieldDefinition => d.pathName !== null
).map((d) => d.pathName);
