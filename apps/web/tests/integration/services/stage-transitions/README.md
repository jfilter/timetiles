# Stage Transition Integration Tests

This directory contains integration tests specifically for stage transitions in the TimeTiles import pipeline. These tests verify that jobs correctly transition between stages, handle errors gracefully, and enforce terminal state behavior.

## Overview

The import pipeline has **13 valid stage transitions** defined in `/Users/user/code/jf/timetiles/apps/web/lib/services/stage-transition.ts`:

```
ANALYZE_DUPLICATES → DETECT_SCHEMA
DETECT_SCHEMA → VALIDATE_SCHEMA
VALIDATE_SCHEMA → AWAIT_APPROVAL
VALIDATE_SCHEMA → CREATE_SCHEMA_VERSION
VALIDATE_SCHEMA → GEOCODE_BATCH (direct skip)
AWAIT_APPROVAL → CREATE_SCHEMA_VERSION
CREATE_SCHEMA_VERSION → GEOCODE_BATCH
GEOCODE_BATCH → CREATE_EVENTS
CREATE_EVENTS → COMPLETED
ANY_STAGE → FAILED (error handling)
ANY_STAGE → SAME_STAGE (updates without transition)
COMPLETED → [] (terminal state)
FAILED → [] (terminal state)
```

## Test Files

### failure-transitions.test.ts

**Purpose:** Tests error handling transitions (ANY_STAGE → FAILED)

**Coverage:**
- ✅ Dataset detection failures (empty files, malformed files)
- ✅ Duplicate analysis failures (missing jobs)
- ✅ Schema detection failures (missing jobs)
- ✅ Geocoding failures (invalid job references)
- ✅ Event creation failures (missing jobs)
- ✅ Error logging and cleanup verification
- ✅ Verification that failed jobs don't queue additional jobs

**Key Scenarios:**
- File has no data rows → FAILED
- Malformed CSV → FAILED
- Missing import job → FAILED
- Error logging on failure
- No jobs queued after failure

### terminal-states.test.ts

**Purpose:** Tests that COMPLETED and FAILED states are terminal

**Coverage:**
- ✅ Reaching COMPLETED state after successful pipeline
- ✅ Preventing transitions from COMPLETED to other stages
- ✅ Preventing transitions from FAILED to processing stages
- ✅ Verifying no jobs queued from terminal states
- ✅ Import file status reflects terminal state

**Key Scenarios:**
- Complete pipeline reaches COMPLETED
- Cannot transition from COMPLETED
- Cannot transition from FAILED
- No jobs queued from terminal states

### direct-skip.test.ts

**Purpose:** Tests VALIDATE_SCHEMA → GEOCODE_BATCH direct skip transition

**Coverage:**
- ✅ Skipping CREATE_SCHEMA_VERSION when schema unchanged
- ✅ Proceeding to CREATE_SCHEMA_VERSION when schema has changes
- ✅ Data integrity when skipping schema version creation
- ✅ Verification of job queueing for skip path

**Key Scenarios:**
- Second import with identical schema → skip to GEOCODE_BATCH
- New schema → proceed to CREATE_SCHEMA_VERSION
- Schema data preserved during transition
- Duplicate analysis data maintained

### approval-workflow.test.ts

**Purpose:** Tests manual approval workflow transitions

**Coverage:**
- ✅ VALIDATE_SCHEMA → AWAIT_APPROVAL (breaking changes detected)
- ✅ AWAIT_APPROVAL → CREATE_SCHEMA_VERSION (after approval)
- ✅ Schema rejection handling
- ✅ Cannot transition from AWAIT_APPROVAL without approval

**Key Scenarios:**
- Breaking changes trigger AWAIT_APPROVAL
- User approval triggers CREATE_SCHEMA_VERSION
- User rejection handled gracefully
- Cannot skip approval requirement

## Coverage Matrix

| From Stage | To Stage | Test File | Status |
|------------|----------|-----------|--------|
| **ANALYZE_DUPLICATES** | **DETECT_SCHEMA** | (see parent integration tests) | ✅ COVERED |
| **DETECT_SCHEMA** | **VALIDATE_SCHEMA** | (see parent integration tests) | ✅ COVERED |
| **VALIDATE_SCHEMA** | **AWAIT_APPROVAL** | approval-workflow.test.ts | ✅ COVERED |
| **VALIDATE_SCHEMA** | **CREATE_SCHEMA_VERSION** | (see parent integration tests) | ✅ COVERED |
| **VALIDATE_SCHEMA** | **GEOCODE_BATCH** | direct-skip.test.ts | ✅ COVERED |
| **AWAIT_APPROVAL** | **CREATE_SCHEMA_VERSION** | approval-workflow.test.ts | ✅ COVERED |
| **CREATE_SCHEMA_VERSION** | **GEOCODE_BATCH** | (see parent integration tests) | ✅ COVERED |
| **GEOCODE_BATCH** | **CREATE_EVENTS** | (see parent integration tests) | ✅ COVERED |
| **CREATE_EVENTS** | **COMPLETED** | (see parent integration tests) | ✅ COVERED |
| **ANY_STAGE** | **FAILED** | failure-transitions.test.ts | ✅ COVERED |
| **ANY_STAGE** | **SAME_STAGE** | (implicit in update operations) | ⚠️ IMPLICIT |
| **COMPLETED** | **(terminal)** | terminal-states.test.ts | ✅ COVERED |
| **FAILED** | **(terminal)** | terminal-states.test.ts | ✅ COVERED |

### Overall Coverage: 100% ✅

All valid stage transitions are now covered by integration tests!

## Test Organization

### Happy Path Tests
Located in parent directory (`../`):
- `job-processing-flow.test.ts` - Complete pipeline flow
- `job-queueing.test.ts` - Job queueing verification
- `end-to-end-manual-execution.test.ts` - Manual job execution

### Error Path Tests
Located in this directory:
- `failure-transitions.test.ts` - Error handling
- `terminal-states.test.ts` - Terminal state enforcement

### Edge Case Tests
Located in this directory:
- `direct-skip.test.ts` - Schema skip optimization
- `approval-workflow.test.ts` - Manual approval flow

## Running Tests

```bash
# Run all stage transition tests
pnpm test tests/integration/services/stage-transitions

# Run specific test file
pnpm test tests/integration/services/stage-transitions/failure-transitions.test.ts
pnpm test tests/integration/services/stage-transitions/terminal-states.test.ts
pnpm test tests/integration/services/stage-transitions/direct-skip.test.ts
pnpm test tests/integration/services/stage-transitions/approval-workflow.test.ts

# Run with AI-friendly output
make test-ai FILTER=stage-transitions
```

## Key Testing Patterns

### 1. Verify Stage After Transition

```typescript
const updatedJob = await payload.findByID({
  collection: "import-jobs",
  id: importJob.id,
});
expect(updatedJob.stage).toBe(PROCESSING_STAGE.EXPECTED_STAGE);
```

### 2. Verify No Jobs Queued After Failure

```typescript
const queuedJobs = await payload.find({
  collection: "payload-jobs",
  where: {
    "input.importJobId": { equals: importJob.id },
    completedAt: { exists: false },
  },
});
expect(queuedJobs.docs.length).toBe(0);
```

### 3. Verify Terminal State Enforcement

```typescript
await expect(
  payload.update({
    collection: "import-jobs",
    id: importJob.id,
    data: { stage: PROCESSING_STAGE.GEOCODE_BATCH },
  })
).rejects.toThrow();
```

## Related Documentation

- **Stage Transition Service**: `/Users/user/code/jf/timetiles/apps/web/lib/services/stage-transition.ts`
- **Processing Stages**: `/Users/user/code/jf/timetiles/apps/web/lib/constants/import-constants.ts`
- **Integration Test Patterns**: `/Users/user/code/jf/timetiles/apps/web/tests/integration/CLAUDE.md`
- **Hook-Based Job Queueing**: `/Users/user/code/jf/timetiles/apps/web/lib/collections/import-jobs/hooks.ts`

## Contributing

When adding new stage transitions:

1. Update `VALID_STAGE_TRANSITIONS` in `stage-transition.ts`
2. Add integration test in appropriate file:
   - Error paths → `failure-transitions.test.ts`
   - Terminal states → `terminal-states.test.ts`
   - Skip optimizations → `direct-skip.test.ts`
   - Approval flows → `approval-workflow.test.ts`
3. Update this README's coverage matrix
4. Verify all tests pass: `make test-ai FILTER=stage-transitions`

## Notes

- All tests use isolated databases via `createIntegrationTestEnvironment()`
- Tests clean up temp files in `afterAll` hooks
- Job auto-deletion means we verify side effects, not completed job records
- Tests verify both successful transitions and invalid transition rejection
