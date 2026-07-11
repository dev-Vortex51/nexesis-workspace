# AI Workflow Rules

## Approach

Build Nexesis incrementally using a specification-driven workflow. Every implementation must follow the project context files, which define the product requirements, architecture, workflows, and current development state. Implement only what is explicitly defined in these specifications, keeping the system modular, verifiable, and aligned with the established architecture.

## Scoping Rules

- Work on one feature unit at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.
- A feature unit is defined as: a single user-facing capability that can be verified end-to-end, or a single API endpoint with its full validation, auth, and service layer.

## When to Split Work

Split an implementation step if it combines:

- User interface implementation and backend workflow logic.
- Multiple unrelated API endpoints or domain modules.
- Requirements that are ambiguous or not fully defined in the context files.
- Database schema changes and business logic changes in the same unit.

If a change cannot be verified end to end quickly,
the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing.
- If a requirement is missing, add it as an open question in `progress-tracker.md` before continuing.
- When in doubt, ask for clarification rather than making assumptions.

## Protected Files

Do not modify the following unless explicitly instructed:

- `components/ui/*` — generated UI library components.
- Third-party libraries, generated code, framework internals, database migration history, and package lock files.
- `architecture.md` invariants — never violate the four core invariants during implementation.

## Keeping Docs in Sync

Update the relevant context file whenever implementation
changes:

- System architecture or boundaries.
- Storage model decisions.
- Code conventions or standards.
- Feature scope.

## Progress Tracker

Maintain `progress-tracker.md` to track completed, in-progress, and pending feature units. Update it after every implementation step.

### Progress Tracker Template

```markdown
# Nexesis Progress Tracker

## Completed
- [x] Feature unit name — Date — Verification notes

## In Progress
- [ ] Feature unit name — Started date — Blockers / open questions

## Pending
- [ ] Feature unit name — Dependencies — Estimated complexity (S/M/L)

## Open Questions
1. Question description — Added date — Status (open/resolved)

## Architecture Decisions
1. Decision description — Date — Rationale

## Known Issues
1. Issue description — Severity — Planned fix date
```

## Feature Unit Definition Template

Before implementing any feature unit, document it with:

```markdown
### Feature Unit: [Name]

**Scope**: What this unit covers and what it explicitly does not cover.
**User Story**: As a [role], I want [capability] so that [benefit].
**Acceptance Criteria**:
1. Criterion 1 (verifiable, specific)
2. Criterion 2
3. Criterion 3
**API Endpoints**: List of endpoints needed (if any)
**Database Changes**: Schema changes required (if any)
**UI Components**: Components to build or modify (if any)
**Dependencies**: Other feature units that must be complete first
**Estimated Complexity**: S / M / L
```

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture.md` was violated.
3. `progress-tracker.md` reflects the completed work.
4. `npm run build` passes.
5. All acceptance criteria for the current unit are verified manually or via automated tests.
6. No console errors or warnings in the browser.
7. The implementation follows all code standards defined in `code-standards.md`.
8. Database queries include proper tenant isolation (`institutionId` filters).
9. Authentication and authorization are enforced on all protected routes and API endpoints.
10. Audit logging is implemented for all critical actions in the unit.

## Verification Checklist Per Feature Unit

### Backend Verification
- [ ] All input validated with Zod schemas
- [ ] Authentication enforced on all routes
- [ ] Authorization enforced with role checks
- [ ] Resource ownership verified before mutations
- [ ] Database transactions used for multi-record operations
- [ ] Error handling covers all error categories from `architecture.md`
- [ ] Rate limiting applied where appropriate
- [ ] Audit logs written for critical actions
- [ ] Notifications triggered where specified

### Frontend Verification
- [ ] Server Components used by default; `use client` only where necessary
- [ ] Loading states implemented
- [ ] Error boundaries handle failures gracefully
- [ ] Form validation mirrors backend Zod schemas
- [ ] Responsive design works at all breakpoints
- [ ] Dark mode renders correctly
- [ ] Keyboard navigation works
- [ ] Screen reader labels present on interactive elements
- [ ] No hardcoded colors; all tokens from `ui-context.md`

### Integration Verification
- [ ] End-to-end flow tested manually
- [ ] API responses match expected structure
- [ ] File uploads work with correct type/size validation
- [ ] Real-time updates received via Socket.IO where applicable
- [ ] Notifications delivered through configured channels
