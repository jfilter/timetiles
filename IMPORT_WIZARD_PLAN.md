# Import Wizard Redesign Plan

## Current Progress (as of session end)

**Worktree:** `/Users/user/code/jf/timetiles-import-wizard` (branch: `feature/import-wizard`)

### Phase 1: Authentication Foundation - COMPLETED
- [x] Created git worktree for feature branch
- [x] Modified `apps/web/lib/collections/users.ts`:
  - [x] Added `auth.verify` configuration with email templates
  - [x] Added `auth.forgotPassword` configuration with email templates
  - [x] Modified `create` access control for self-registration
  - [x] Added `registrationSource` field
  - [x] Updated `beforeChange` hook for self-registration constraints
- [x] Created migration for users collection changes (email verification + registrationSource)
- [x] Created `/app/verify-email/page.tsx` email verification landing page
- [x] Removed anonymous upload support:
  - [x] Modified `import-files.ts` to require authentication
  - [x] Removed `sessionId` field
  - [x] Made `user` field required
  - [x] Created migration to drop sessionId column
- [x] Created auth UI components in `components/auth/`:
  - [x] `login-form.tsx` - Login form using Payload auth
  - [x] `register-form.tsx` - Registration form with email verification message
  - [x] `auth-tabs.tsx` - Combined tabbed interface
  - [x] `index.ts` - Exports
- [x] Added Tabs component to `@timetiles/ui` package:
  - [x] Added `@radix-ui/react-tabs` dependency
  - [x] Created `packages/ui/src/components/tabs.tsx`
  - [x] Added Input, Label, Tabs exports to UI package

### Next Steps:
1. Start Phase 2: Wizard Framework

### To Resume:
```bash
cd /Users/user/code/jf/timetiles-import-wizard
make check-ai PACKAGE=web  # Check current errors
```

---

## Overview

Redesign the TimeTiles import page as a multi-step wizard similar to Datawrapper/CiviCRM, with:
- Required account authentication to complete imports
- Linear wizard flow (6 steps)
- Schema similarity suggestions for dataset selection
- Field mapping configuration UI
- Local storage persistence for wizard state

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Account requirement | Required | Users must log in or register to complete import |
| Email verification | Required | Must verify email before completing first import |
| Wizard pattern | Linear (fixed steps) | Clear progression, prevents skipping configuration |
| Dataset suggestions | Schema similarity | Analyze uploaded schema, suggest matching datasets |
| State persistence | LocalStorage | Survives refresh, cleared on completion |
| Sheet mapping step | Always show | User can always choose target dataset, even for single-sheet files |

---

## Wizard Steps

```
[1] Auth → [2] Upload → [3] Dataset Selection → [4] Field Mapping → [5] Review → [6] Processing
```

### Step 1: Authentication
- Check if user is logged in
- Show login/register tabs if not
- After registration, show "verification email sent" message
- Block progression until email verified
- **Note:** Anonymous uploads removed - authentication required before upload

### Step 2: File Upload
- Drag-and-drop upload zone
- Display file size limits based on user trust level
- Parse file client-side to detect sheets
- Show detected sheets with row counts and headers
- Store file in temporary location with previewId

### Step 3: Dataset Selection
- Show user's existing catalogs (dropdown)
- Option to create new catalog
- For each sheet: select existing dataset OR create new
- Display schema similarity scores for each sheet
- Show matching/missing/new fields comparison
- Always shown (even for single-sheet files)

### Step 4: Field Mapping
- Tab per sheet (if multiple)
- Auto-detected mappings pre-filled (highlighted)
- **Required fields:**
  - Title field
  - Date field
  - Geo-address (one of: Address/Location string OR Latitude+Longitude coordinates)
- **Optional fields:**
  - Description
  - End Date
  - ID field (for external/computed strategies)
- Sample data preview table (5 rows)
- **ID Strategy selector** (reuses existing `datasets.idStrategy`):
  - `external` - Use ID from source data
  - `computed` - Hash from specified fields
  - `auto` - Auto-generate (default, content-hash for dedup)
  - `hybrid` - Try external, fallback to computed

### Step 5: Review
- Summary cards: file info, target catalog, dataset mappings
- Field mappings table per dataset
- Import options: deduplication strategy, geocoding toggle
- Confirm button

### Step 6: Processing
- Progress tracking (reuse existing useImportProgressQuery)
- Per-dataset progress bars
- Error display
- Completion summary with links to view data

---

## Reuse from Existing Automated Import Workflow

The wizard leverages the existing import pipeline rather than replacing it. The key difference is that the wizard **pre-configures** settings that the automated workflow would auto-detect.

### Existing Pipeline Stages (Automated)
```
DATASET_DETECTION → ANALYZE_DUPLICATES → DETECT_SCHEMA → VALIDATE_SCHEMA
    → AWAIT_APPROVAL → CREATE_SCHEMA_VERSION → GEOCODE_BATCH → CREATE_EVENTS → COMPLETED
```

### Wizard Flow Integration
```
┌─────────────────────────────────────────────┐
│           WIZARD UI (New)                   │
│  Auth → Upload → Dataset → Mapping → Review │
└─────────────────────────────────────────────┘
                    ↓
         Pre-configures dataset with:
         - idStrategy (user-selected)
         - fieldMappingOverrides (user-mapped)
         - schemaConfig settings
                    ↓
┌─────────────────────────────────────────────┐
│    EXISTING PIPELINE (Reused)               │
│  ANALYZE_DUPLICATES → DETECT_SCHEMA → ...   │
│  (Uses pre-configured settings)             │
└─────────────────────────────────────────────┘
```

### Services to Reuse (No Changes Needed)

| Service | Location | Reuse |
|---------|----------|-------|
| `IdGenerationService` | `lib/services/id-generation.ts` | ID strategy already supports all 4 types |
| `ProgressiveSchemaBuilder` | `lib/services/schema-builder/` | Schema detection for preview |
| `detectFieldMappings()` | `lib/services/schema-builder/field-mapping-detection.ts` | Auto-detect title/date/location |
| File parsing | `lib/jobs/handlers/dataset-detection-job.ts` | CSV/Excel parsing functions |
| `schema-comparison.ts` | `lib/services/schema-builder/` | Schema similarity algorithm base |

### Pipeline Stages to Reuse (After Wizard Completes)

| Stage | What It Does | How Wizard Helps |
|-------|--------------|------------------|
| `ANALYZE_DUPLICATES` | Find duplicate records | Uses user-configured `idStrategy` |
| `DETECT_SCHEMA` | Infer schema from data | Already previewed in wizard |
| `VALIDATE_SCHEMA` | Compare with existing | Field mappings pre-approved |
| `AWAIT_APPROVAL` | Wait for user | **Skipped** - user pre-approved in wizard |
| `CREATE_SCHEMA_VERSION` | Save schema | Uses wizard-configured mappings |
| `GEOCODE_BATCH` | Geocode addresses | Uses wizard-mapped location field |
| `CREATE_EVENTS` | Create event records | All config ready |

### Key Insight: Wizard = Pre-Configuration

The wizard doesn't replace the pipeline—it **pre-populates** the dataset configuration so the automated pipeline can run without needing the `AWAIT_APPROVAL` stage.

---

## Component Architecture

```
apps/web/app/import/
├── page.tsx                              # Entry point, renders wizard
└── _components/
    ├── import-wizard.tsx                 # Main wizard container
    ├── wizard-context.tsx                # React Context + useReducer
    ├── wizard-progress.tsx               # Step indicator (1-6)
    ├── wizard-navigation.tsx             # Back/Next buttons
    ├── steps/
    │   ├── step-auth.tsx                 # Login/Register forms
    │   ├── step-upload.tsx               # File upload (refactor existing)
    │   ├── step-dataset-selection.tsx    # Catalog + dataset selection
    │   ├── step-field-mapping.tsx        # Field mapping configuration
    │   ├── step-review.tsx               # Final review
    │   └── step-processing.tsx           # Progress tracking
    └── shared/
        ├── schema-similarity-card.tsx    # Display similar datasets
        ├── field-mapping-row.tsx         # Single field mapping
        ├── data-preview-table.tsx        # Sample data preview
        └── sheet-selector.tsx            # Sheet to dataset mapping

components/auth/
├── auth-modal.tsx                        # Modal wrapper for auth
├── login-form.tsx                        # Payload login
└── register-form.tsx                     # Self-registration
```

---

## State Management

### Wizard Context State

```typescript
interface WizardState {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;

  // Step 1: Auth
  user: User | null;
  sessionId: string;

  // Step 2: Upload
  previewId: string | null;
  file: { name: string; size: number; mimeType: string } | null;
  sheets: Array<{
    index: number;
    name: string;
    rowCount: number;
    headers: string[];
    sampleData: Record<string, unknown>[];
  }>;

  // Step 3: Dataset Selection
  selectedCatalogId: number | 'new';
  newCatalogName: string;
  sheetMappings: Array<{
    sheetIndex: number;
    datasetId: number | 'new';
    newDatasetName: string;
    similarityScore: number | null;
  }>;

  // Step 4: Field Mapping
  fieldMappings: Array<{
    sheetIndex: number;
    titleField: string;
    descriptionField: string | null;
    dateField: string;
    endDateField: string | null;
    idField: string | null;
    idStrategy: 'external' | 'computed' | 'auto';
    locationField: string | null;
    latitudeField: string | null;
    longitudeField: string | null;
  }>;

  // Step 5: Review
  deduplicationStrategy: 'skip' | 'update' | 'version';
  geocodingEnabled: boolean;

  // Step 6: Processing
  importFileId: number | null;
  isProcessing: boolean;
  error: string | null;
}
```

### LocalStorage Persistence

```typescript
// Key: 'timetiles_import_wizard_draft'
// Save on every state change (debounced 500ms)
// Clear on: completion, explicit cancel, or 24h expiry
// Restore on page load if exists
```

---

## New API Endpoints

### 1. GET /api/wizard/catalogs
Returns user's catalogs with datasets and quota info.

### 2. POST /api/wizard/preview-schema
Uploads file, generates schema preview and similarity suggestions.

Request: `multipart/form-data` with file
Response:
```typescript
{
  previewId: string;
  sheets: SheetInfo[];
  sampleData: Record<string, unknown>[];
  detectedMappings: FieldMappings;
  similarDatasets: SchemaSimilarity[];
  expiresAt: string;
}
```

### 3. POST /api/wizard/configure-import
Creates import with user configuration.

Request:
```typescript
{
  previewId: string;
  catalogId: number | 'new';
  newCatalogName?: string;
  sheetConfigs: Array<{
    sheetIndex: number;
    datasetId: number | 'new';
    newDatasetName?: string;
    fieldMappings: FieldMappings;
    idStrategy: IdStrategy;
  }>;
  deduplicationStrategy: string;
  geocodingEnabled: boolean;
}
```

### 4. POST /api/auth/register
Self-service registration with email verification.

### 5. GET /api/auth/verify-email
Validates verification token, activates account.

---

## Schema Similarity Algorithm

Create `/apps/web/lib/services/schema-similarity.ts`:

```typescript
// Weighted scoring (0-100):
// - Field name overlap (Jaccard + fuzzy): 35%
// - Type compatibility: 25%
// - Structure similarity: 20%
// - Semantic hints (geo, date fields): 15%
// - Language match: 5%

// Reuse from schema-comparison.ts:
// - calculateSimilarity() for Levenshtein distance
// - typesCompatible() for type checking
```

---

## Authentication Changes (Using Payload Built-in Features)

### Users Collection Modifications

**Enable Payload's built-in email verification** (auto-adds `_verified`, `_verificationToken` fields):

```typescript
// In users.ts
const Users: CollectionConfig = {
  slug: "users",
  auth: {
    verify: {
      generateEmailHTML: ({ token, user }) => {
        const url = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/verify-email?token=${token}`;
        return `Hey ${user.email}, verify your email: ${url}`;
      },
      generateEmailSubject: ({ user }) => {
        return `Verify your TimeTiles account`;
      },
    },
  },
  // ...
}
```

**Add field for tracking registration source:**
- `registrationSource` (select: admin, self) - to distinguish self-registered users

**Modify access control for self-registration:**
```typescript
create: ({ req: { user } }) => {
  if (user?.role === "admin") return true;
  if (!user) return true;  // Allow self-registration (unauthenticated)
  return false;
}
```

**Add beforeChange hook for self-registration constraints:**
```typescript
beforeChange: [
  ({ data, operation, req }) => {
    // For self-registration (unauthenticated creation)
    if (operation === "create" && !req.user) {
      data.role = "user";  // Force user role (prevent privilege escalation)
      data.trustLevel = String(TRUST_LEVELS.BASIC);  // Basic quotas
      data.registrationSource = "self";
    }
    return data;
  },
]
```

### Payload Auto-Generated Endpoints (No Custom Code Needed)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/users` | Create user (self-registration) |
| `POST /api/users/login` | Login with email/password |
| `POST /api/users/logout` | Logout |
| `POST /api/users/verify/{token}` | Verify email (auto-generated when `auth.verify` enabled) |
| `POST /api/users/forgot-password` | Request password reset |
| `POST /api/users/reset-password` | Reset password with token |

### Verification Page

Create `/apps/web/app/verify-email/page.tsx`:
- Reads `token` from query params
- Calls `POST /api/users/verify/{token}`
- Shows success/error message
- Redirects to import wizard or login

---

## Critical Files to Modify

| File | Changes |
|------|---------|
| `apps/web/app/import/page.tsx` | Replace with wizard entry point |
| `apps/web/app/import/_components/import-upload.tsx` | Refactor into step-upload.tsx |
| `apps/web/lib/collections/users.ts` | Add email verification fields, enable self-registration |
| `apps/web/lib/collections/import-files.ts` | Add wizard config to metadata |
| `apps/web/lib/hooks/use-events-queries.ts` | Add wizard-related queries |
| `apps/web/lib/services/schema-builder/schema-comparison.ts` | Extend for similarity scoring |

## New Files to Create

| File | Purpose |
|------|---------|
| `app/import/_components/import-wizard.tsx` | Main wizard container |
| `app/import/_components/wizard-context.tsx` | State management |
| `app/import/_components/wizard-progress.tsx` | Step indicator |
| `app/import/_components/wizard-navigation.tsx` | Navigation buttons |
| `app/import/_components/steps/*.tsx` | Individual step components |
| `app/api/wizard/*/route.ts` | New wizard API endpoints |
| `app/verify-email/page.tsx` | Email verification landing page |
| `lib/services/schema-similarity.ts` | Similarity algorithm |
| `lib/services/preview-cache.ts` | Preview storage (in-memory) |
| `components/auth/*.tsx` | Auth UI components (login/register forms) |

---

## Implementation Phases

### Phase 1: Authentication Foundation (2-3 days)
1. Enable Payload's built-in `auth.verify` on Users collection
2. Add `registrationSource` field to Users collection
3. Modify `create` access control for self-registration
4. Add `beforeChange` hook to force role/trustLevel for self-registrants
5. Create `/app/verify-email/page.tsx` verification landing page
6. Remove anonymous upload support (require authentication for file upload)
7. Create auth UI components (login-form, register-form, auth-modal)

### Phase 2: Wizard Framework (2-3 days)
1. Create wizard context with useReducer
2. Create wizard container component
3. Create progress indicator
4. Create navigation component
5. Implement localStorage persistence
6. Create basic step components (skeleton)

### Phase 3: Upload & Preview APIs (3-4 days)
1. Create preview-cache service
2. Create preview-schema API endpoint
3. Create catalogs API endpoint
4. Implement schema similarity service
5. Create step-upload component (refactor existing)

### Phase 4: Dataset Selection (2-3 days)
1. Create schema-similarity-card component
2. Create step-dataset-selection component
3. Integrate similarity suggestions
4. Handle new catalog/dataset creation

### Phase 5: Field Mapping (3-4 days)
1. Create field-mapping-row component
2. Create data-preview-table component
3. Create step-field-mapping component
4. Integrate auto-detection from existing services
5. Add ID strategy configuration

### Phase 6: Review & Processing (2-3 days)
1. Create step-review component
2. Create configure-import API endpoint
3. Create step-processing component
4. Integrate existing progress tracking
5. Handle completion and cleanup

### Phase 7: Testing & Polish (3-4 days)
1. Unit tests for similarity algorithm
2. Integration tests for API endpoints
3. E2E tests for full wizard flow
4. Error handling review
5. Accessibility review

**Total Estimate: 16-22 days**

> Note: Using Payload's built-in auth features (email verification, login, forgot password) reduces Phase 1 complexity significantly.

---

## Testing Strategy

### Unit Tests
- Schema similarity algorithm
- Session transfer service
- Wizard state reducer
- Field mapping validation

### Integration Tests
- Registration → verification → login flow
- Preview schema → configure import flow
- Session transfer after login

### E2E Tests
- Full wizard flow: anonymous → register → verify → import
- Full wizard flow: existing user → login → import
- Excel multi-sheet import
- State persistence on refresh
- Error recovery scenarios
