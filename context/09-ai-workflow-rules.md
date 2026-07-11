# AI Workflow Rules

## Approach

Build Nexesis incrementally using a specification-driven workflow. Every implementation must follow the project context files, which define the product requirements, architecture, workflows, and current development state. Implement only what is explicitly defined in these specifications, keeping the system modular, verifiable, and aligned with the established architecture.

## Feature Unit Definition

A "feature unit" is the smallest deliverable piece of functionality that can be verified end-to-end. It typically corresponds to one of:

- A single API endpoint with its service logic and tests.
- A single UI page or major component with its data flow.
- A single workflow stage transition with its triggers and notifications.
- A single background job with its scheduling and execution.

A feature unit must:
1. Have a clear input and output.
2. Be testable in isolation.
3. Not span multiple system boundaries (e.g., do not combine UI + API + database schema changes in one unit unless they are tightly coupled).

## Scoping Rules

- Work on one feature unit at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.
- A feature unit should be completable in a single focused session (1–3 hours of implementation).

## When to Split Work

Split an implementation step if it combines:

- User interface implementation and backend workflow logic.
- Multiple unrelated API endpoints or domain modules.
- Requirements that are ambiguous or not fully defined in the context files.

If a change cannot be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing.
- If a requirement is missing, add it as an open question in `progress-tracker.md` before continuing.

## Protected Files

Do not modify the following unless explicitly instructed:

- `components/ui/*` — generated UI library components.
- Third-party libraries, generated code, framework internals, database migration history, and package lock files.

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries → `07-tech-stack.md`
- Storage model decisions → `04-data-model.md`
- Code conventions or standards → `08-code-standards.md`
- Feature scope → `02-user-requirements.md` or `03-workflow-spec.md`

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `07-tech-stack.md` was violated.
3. `progress-tracker.md` reflects the completed work.
4. `npm run build` passes.

## Rollback Rules

If a feature unit fails verification:

1. Identify the root cause (test failure, build error, runtime bug).
2. Fix within the unit's scope if the fix is small (< 30 min).
3. If the fix requires redesign or touches other units, revert the change and document the blocker in `progress-tracker.md`.
4. Never leave a broken unit in the codebase.

## Context Loading Strategy

To optimize token usage during implementation:

1. Load only the context files relevant to the current feature unit.
2. Reference other files by name rather than duplicating content.
3. Use `progress-tracker.md` as the source of truth for current state.
4. When a question spans multiple files, load them in order: requirements → workflow → data model → API spec → UI spec.
