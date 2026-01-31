# Software Architect Agent Redesign

**Date:** 2026-01-30

## Problem

The current `software-architect.md` agent is 36 lines — the thinnest agent in the project. It provides generic instructions ("study existing architecture", "produce specs") without methodology, templates, decision frameworks, or project-specific knowledge. Compare to `backend-specialist.md` at 411 lines with embedded patterns, code examples, and file references.

## Design

### Modes of Operation

The agent operates in three distinct modes, auto-detected from the prompt:

1. **Design Mode** — "Design feature X." Follows: Investigate > Analyze > Design > Reflect > Present ADR
2. **Review Mode** — "Review the import pipeline architecture." Follows: Investigate > Identify Issues > Categorize > Recommend > Present ADR
3. **Decision Mode** — "Should we use WebSockets or SSE?" Follows: Frame Question > Research Options > Evaluate > Recommend > Present ADR

All three modes end with an ADR written to `docs/adr/`. The agent detects the mode from the prompt — no explicit flag needed. If ambiguous, it asks one clarifying question.

### Agent Metadata

- **Model:** `opus` (complex reasoning needed)
- **Tools:** `Read, Grep, Glob` (read-only, no code writing)
- **Constraint:** NEVER writes code — only plans and designs

### Mandatory Investigation Phase

Before any design work, the agent must investigate. This is not optional.

**Always check:**

- `lib/collections/` — existing collection patterns, field types, hooks
- `lib/services/` — business logic, stage transitions, access control
- `lib/hooks/` — React Query hooks, data fetching patterns
- `app/api/` — existing API endpoints and auth patterns
- `payload.config.ts` — current Payload configuration
- `migrations/` — recent migration history and schema state

**Check when relevant:**

- `components/` — UI patterns if the design touches frontend
- `lib/jobs/handlers/` — job queue patterns if async work involved
- `packages/ui/` — shared component library
- `tests/` — existing test patterns for the area being designed
- `docs/adr/` — previous ADRs to maintain consistency and avoid contradicting past decisions

**Investigation output:** The agent summarizes what it found before proceeding to design. This grounds the design in reality and gives the user a chance to correct misunderstandings early.

### Self-Critique Reflection Checklist

After drafting a design but before presenting it, the agent runs through this checklist internally and revises anything that fails:

**Architectural Fit:**

- Does this follow existing patterns in the codebase, or introduce a new one? If new, is that justified?
- Does it respect the monorepo structure (apps/web, packages/ui, packages/assets)?
- Does it work with Payload CMS 3 conventions (collections, hooks, access control)?

**Data & Schema:**

- Are database migrations needed? What tables/columns change?
- Is the coordinate order [longitude, latitude] preserved?
- Are relationships using numeric IDs (not objects)?

**Access Control & Security:**

- Who can read/write/delete? Does it follow Catalog > Dataset > Event cascading?
- Are new endpoints using `withAuth`/`withOptionalAuth`/`withAdminAuth` appropriately?

**Performance:**

- Will this cause N+1 queries? Sequential scans on large tables?
- Are PostGIS operations server-side where they should be?
- Does React Query caching need configuration?

**Impact:**

- What existing features could break?
- Are there job queue implications?
- What needs testing (unit, integration, E2E)?

**YAGNI Check:**

- Is anything in this design speculative or "nice to have"? Remove it.

The agent notes in the ADR if any checklist item surfaced a concern and how it was addressed.

### ADR Output Format

**File location:** `docs/adr/NNNN-<kebab-case-title>.md` (zero-padded sequential). The agent checks existing files in `docs/adr/` to determine the next number. Creates the directory if it doesn't exist.

**Template:**

```markdown
# NNNN. Title of Decision

**Status:** Proposed | Accepted | Deprecated | Superseded by [NNNN]

**Date:** YYYY-MM-DD

**Context:**
What is the issue? What forces are at play? What did investigation of the
codebase reveal? Reference specific files (e.g., `lib/services/foo.ts:42`).

**Decision:**
What is the change being proposed or decided? Be specific — name collections,
endpoints, hooks, fields.

**Consequences:**
What becomes easier or harder? What are the migration steps? What needs testing?
```

**Rules:**

- Context section must reference actual files found during investigation
- Decision section must be specific enough for an implementation agent to act on
- Consequences must include migration steps if schema changes are involved
- One decision per ADR. Multiple decisions = multiple ADRs that reference each other

### Project-Specific Knowledge

Embedded key files reference:

| Purpose | Location |
|---------|----------|
| Payload config | `payload.config.ts` |
| Config factory | `lib/config/payload-config-factory.ts` |
| Collections | `lib/collections/` |
| Services | `lib/services/` |
| Job handlers | `lib/jobs/handlers/` |
| Stage transitions | `lib/services/stage-transition.ts` |
| Access control | `lib/services/access-control.ts` |
| Auth middleware | `lib/middleware/auth.ts` |
| API response helpers | `lib/utils/api-response.ts` |
| API routes | `app/api/` |
| React Query hooks | `lib/hooks/` |
| Shared UI | `packages/ui/` |
| Migrations | `migrations/` |
| ADRs | `docs/adr/` |

Embedded conventions: named imports only, logger not console.log, numeric relationship IDs, pass `req` in hooks, context flags for loop prevention, never edit committed migrations.

### Mode-Specific Behavior

**Design Mode** (triggered by "design", "plan", "architect", "how should we build"):

1. Investigate relevant code areas
2. Summarize current state
3. Propose 2-3 approaches with trade-offs and a recommendation
4. After user selects approach, draft full design
5. Run reflection checklist, revise
6. Present design and write ADR to `docs/adr/`

**Review Mode** (triggered by "review", "evaluate", "assess", "audit architecture"):

1. Investigate the target area thoroughly
2. Categorize findings: technical debt, architectural risk, code smell, or strength
3. Prioritize issues by impact (breaking, performance, maintainability)
4. Recommend changes with specific file references
5. Run reflection checklist against recommendations
6. Write ADR for any significant recommended changes

**Decision Mode** (triggered by "should we", "compare", "which approach", "A vs B"):

1. Frame the decision clearly — what exactly are we choosing between?
2. Investigate how each option fits the existing codebase
3. Evaluate against criteria: complexity, migration cost, performance, maintainability, alignment with existing patterns
4. Recommend one option with clear reasoning
5. Run reflection checklist
6. Write ADR documenting the decision

## Research Sources

- [Deep Agent Architecture for AI Coding Assistants](https://dev.to/apssouza22/a-deep-dive-into-deep-agent-architecture-for-ai-coding-assistants-3c8b)
- [Agentic AI Design Patterns 2026](https://medium.com/@dewasheesh.rana/agentic-ai-design-patterns-2026-ed-e3a5125162c5)
- [Using ADRs with AI Coding Assistants](https://blog.thestateofme.com/2025/07/10/using-architecture-decision-records-adrs-with-ai-coding-assistants/)
- [Google Cloud Agent Design Patterns](https://docs.google.com/architecture/choose-design-pattern-agentic-ai-system)
- [Microsoft Azure AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Complete Agentic AI System Design Guide 2026](https://atul4u.medium.com/the-complete-agentic-ai-system-design-interview-guide-2026-f95d0cfeb7cf)
