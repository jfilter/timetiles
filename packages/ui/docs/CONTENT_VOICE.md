# Content & Voice Guidelines

> **Part of the TimeTiles Cartographic Design System**
> See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for complete design guidance

## Voice & Tone

TimeTiles communicates with **clarity, precision, and calm authority** — like a skilled cartographer guiding users through complex geospatial data.

### Core Principles

1. **Clear over clever** - Prioritize understanding over wordplay
2. **Precise without jargon** - Technical when necessary, accessible always
3. **Calm and confident** - No exclamation points, no urgency pressure
4. **Respectful of expertise** - Users are professionals; don't patronize

### Voice Attributes

| Attribute | We Are | We Are Not |
|-----------|--------|------------|
| Clarity | Clear, direct | Vague, ambiguous |
| Tone | Professional, calm | Casual, excitable |
| Technical level | Precise, accurate | Overly simplified, dumbed down |
| Personality | Thoughtful, authoritative | Quirky, playful |
| Formality | Professional but approachable | Stiff, corporate |

## Terminology Standards

### Consistent Terms

Use these standardized terms throughout the application:

| ✅ Use This | ❌ Not This | Context |
|------------|------------|---------|
| Dataset | Data set, data-set | Collection of events |
| Event | Item, entry, record | Individual data point |
| Catalog | Category, folder | Grouping of datasets |
| Import | Upload, ingest | Bringing data into TimeTiles |
| Geocode | Geolocate, geo-tag | Convert address to coordinates |
| Map view | Map, mapping | The interactive map interface |
| Timeline | Time slider, temporal filter | Time-based filtering |
| Filter | Search, refine | Narrowing results |
| Field | Column, attribute | Data property |
| Location | Place, address | Geographic reference |

### Capitalization

- **Proper names**: TimeTiles (always capitalized)
- **Features**: dataset, catalog, event (lowercase unless starting sentence)
- **UI elements**: Import wizard, Map view, Timeline (capitalize when referring to specific interface elements)

## Microcopy Patterns

### Buttons

**Action buttons** - Use verb + noun structure:
- ✅ Import Dataset
- ✅ Create Catalog
- ✅ Export Events
- ❌ Import (too vague without context)
- ❌ Click Here to Import (redundant)

**Destructive actions** - Be explicit:
- ✅ Delete Dataset
- ✅ Remove Events
- ❌ Delete (what?)
- ❌ Are you sure? (tell them what they're confirming)

**Secondary actions:**
- ✅ Cancel
- ✅ Go Back
- ✅ Skip This Step
- ❌ Nevermind
- ❌ No Thanks

### Form Labels

**Be direct and specific:**
- ✅ Dataset name
- ✅ Event title field
- ✅ Location address
- ❌ Name (name of what?)
- ❌ Please enter the name (unnecessary politeness)

**Help text** - Provide context without being wordy:
- ✅ "Use a descriptive name like 'Climate Events 2024'"
- ✅ "Address will be geocoded automatically"
- ❌ "Please make sure to enter a good name that describes your dataset"

### Error Messages

**Structure:** [What went wrong] + [Why] + [How to fix]

**Examples:**
- ✅ "Import failed: CSV file is missing required 'date' column. Add a date column and try again."
- ✅ "Geocoding incomplete: 15 addresses could not be located. Review locations in the validation step."
- ❌ "Error! Something went wrong."
- ❌ "An error occurred. Please try again."

**Tone:** Informative, not apologetic
- ✅ "File format not supported. Use CSV, Excel, or ODS."
- ❌ "Oops! We're sorry, but we couldn't process your file."

### Success Messages

**Be specific about what succeeded:**
- ✅ "Dataset imported: 1,234 events geocoded"
- ✅ "Catalog created successfully"
- ❌ "Success!"
- ❌ "Done"

### Loading States

**Be specific about what's happening:**
- ✅ "Geocoding 1,234 addresses..."
- ✅ "Processing import file..."
- ✅ "Analyzing data structure..."
- ❌ "Loading..."
- ❌ "Please wait..."

### Empty States

**Structure:** [What's empty] + [Why] + [What to do]

**Examples:**
- ✅ "No datasets yet. Import your first dataset to get started."
- ✅ "No events match your filters. Adjust filters or clear all to see more results."
- ❌ "Nothing here"
- ❌ "No results found"

## Writing Style

### Sentence Structure

- **Use active voice:** "Import your dataset" not "Your dataset can be imported"
- **Keep sentences short:** One idea per sentence
- **Front-load important info:** Put the action or outcome first

### Punctuation

- **Periods:** Use for complete sentences in body text
- **No periods:** In buttons, labels, short UI text
- **Commas:** Use Oxford comma in lists (events, datasets, and catalogs)
- **Exclamation points:** Never use (too enthusiastic for our tone)
- **Question marks:** Only in actual questions, not rhetorical

### Numbers & Data

- **Small numbers:** Spell out one through nine
- **Large numbers:** Use numerals (10, 100, 1,234)
- **Percentages:** Always use numeral + % (98% not ninety-eight percent)
- **Dates:** Use ISO format in UI (2026-01-28) or "January 28, 2026" in prose

### Abbreviations

**Acceptable:**
- CSV, Excel, ODS (file formats)
- API (widely understood)
- URL (widely understood)

**Avoid:**
- e.g., i.e. (use "for example" or "that is")
- etc. (be specific or use "and more")

## Accessibility

### Alt Text for Images

**Be descriptive and functional:**
- ✅ "Map showing 1,234 climate events across North America"
- ✅ "Timeline histogram displaying event frequency by month"
- ❌ "Map"
- ❌ "Image of data"

### Link Text

**Be descriptive (not "click here"):**
- ✅ "View import documentation"
- ✅ "Download sample CSV file"
- ❌ "Click here for docs"
- ❌ "More info"

### ARIA Labels

**Provide context for screen readers:**
- ✅ `aria-label="Close import wizard"`
- ✅ `aria-label="Filter events by date range"`
- ❌ `aria-label="Close"`
- ❌ `aria-label="Button"`

## Examples by Context

### Dashboard

**Page title:** "Datasets"
**Empty state:** "No datasets yet. Import your first dataset to visualize events on a map."
**Action button:** "Import Dataset"

### Import Flow

**Step 1 title:** "Upload File"
**Help text:** "Supported formats: CSV, Excel (.xlsx), OpenDocument (.ods)"
**Error:** "Import failed: File exceeds 50 MB limit. Split into smaller files and try again."
**Success:** "Schema detected: 1,234 rows with 12 fields"

### Map View

**Filter button:** "Filter Events"
**Empty state:** "No events in selected date range. Adjust timeline or clear filters."
**Loading:** "Loading 1,234 events..."

### Settings

**Section title:** "Dataset Settings"
**Label:** "Dataset visibility"
**Help text:** "Public datasets appear in search results. Private datasets are only visible to you."

## Content Checklist

Before publishing any UI text:

- [ ] Is it clear what will happen?
- [ ] Does it use our standard terminology?
- [ ] Is it concise (removed unnecessary words)?
- [ ] Does it follow our voice and tone?
- [ ] Is it accessible (descriptive links, meaningful labels)?
- [ ] Does it help the user complete their task?

---

**Questions about content?** Check [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for design guidance or open an issue for clarification.
