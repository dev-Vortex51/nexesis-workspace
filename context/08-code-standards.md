# Code Standards

## General

- Keep modules small, cohesive, and single-purpose.
- Solve root causes instead of introducing temporary workarounds.
- Do not mix unrelated business concerns within the same component, service, or route.
- Prefer explicit over implicit. Prefer readable over clever.
- Comment the "why," not the "what." Code should be self-documenting.

## Backend-First Rule

**Implement all backend logic before any frontend code.**

| Phase | What to Build | What NOT to Build |
|-------|--------------|-------------------|
| Backend | API routes, services, database queries, validation, tests | No pages, no components, no CSS |
| Frontend | Pages, components, styling, client-side interactivity | No API logic, no database calls |

A backend unit is complete when:
1. API endpoint accepts and returns correct data.
2. Service layer has unit tests.
3. Integration tests pass.
4. `npm run build` passes (server only).

Only then may frontend work begin.

## TypeScript

- Enable strict mode across the entire project (`strict: true` in `tsconfig.json`).
- Avoid `any`; prefer explicit interfaces, inferred types, or narrowly scoped generics.
- Validate all external input at system boundaries before it reaches business logic.
- Use `unknown` for values from external sources, then narrow with type guards or Zod.
- Prefer `interface` for object shapes, `type` for unions, tuples, and mapped types.
- Export types from `shared/types/`; never duplicate type definitions.

## Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Components | PascalCase | `ProjectCard.tsx` |
| Hooks | camelCase, prefix `use` | `useProjectData.ts` |
| Services | camelCase, suffix `Service` | `projectService.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_UPLOAD_SIZE` |
| Types/Interfaces | PascalCase | `ProjectStage` |
| Enums | PascalCase | `UserRole` |
| Database models | PascalCase (Prisma) | `Project` |
| API routes | kebab-case | `projects/[id]/documents` |

## Next.js

- Default to Server Components whenever possible.
- Add `use client` only when browser interactivity or client-side APIs require it.
- Keep route handlers focused on a single responsibility and delegate business logic to the service layer.
- Use route groups `(auth)`, `(dashboard)` for layout organization.
- Co-locate page-specific components in `app/` using private folders `_components/`.
- Use `loading.tsx` and `error.tsx` for suspense boundaries.

## React

- Prefer composition over prop drilling.
- Keep components under 200 lines; extract when growing.
- Use custom hooks to share stateful logic, not just to extract code.
- Memoize expensive computations with `useMemo`, callbacks with `useCallback`.
- Avoid `useEffect` for data fetching; use Server Components or data libraries.

## Tailwind CSS v4

- Import: `@import "tailwindcss"` in `globals.css`.
- Configure: Use `@theme` block for custom tokens (no `tailwind.config.js`).
- Tokens: All colors, fonts, radii defined as CSS custom properties in `@theme`.
- Usage: Reference tokens via `bg-bg-base`, `text-text-primary`, `border-border-default`.
- Dark mode: `dark:` prefix with CSS variables that swap values.
- No arbitrary values: `w-[123px]` is forbidden. Use tokens or standard utilities.
- No inline styles. No hardcoded hex values.

Example:
```css
@import "tailwindcss";

@theme {
  --color-bg-base: #FAFAFA;
  --color-bg-surface: #FFFFFF;
  --color-text-primary: #0F172A;
  --color-text-muted: #64748B;
  --color-accent-primary: #2563EB;
  --color-border-default: #E2E8F0;
  --color-state-error: #DC2626;
  --color-state-success: #16A34A;
  --font-sans: "Geist Sans", sans-serif;
  --font-mono: "Geist Mono", monospace;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
}
```

## API Routes

- Validate and parse every request before executing business logic.
- Enforce authentication, authorization, and resource ownership before every mutation.
- Return consistent and predictable response structures across all endpoints.
- Use Zod schemas for request body, query, and param validation.
- Return early on errors; avoid nested conditionals.
- Standard response envelope:
  ```json
  { "success": true, "data": {}, "error": null, "meta": {} }
  ```

## Data and Storage

- Store structured business data and relationships in the database.
- Store uploaded documents and large binary assets in object storage.
- Do not store large files or binary content directly in the database.
- Use transactions for multi-step mutations.
- Prefer Prisma queries over raw SQL unless performance-critical.

## File Organization

- `app/` — Application routes, layouts, pages, and route handlers.
- `components/` — Reusable UI components, feature components, and shared presentation logic.
- `server/` — Business logic, services, authentication, authorization, workflows, and data access.
- `lib/` — Shared utilities, helpers, constants, validation schemas, and common infrastructure.
- `shared/` — Types, schemas, constants used by both `app/` and `server/`.
- `database/` — Prisma schema, migrations, seed scripts.
- `tests/` — Test files mirroring source structure.

## Testing

### Unit Tests (Vitest)

- Test services, utilities, and hooks in isolation.
- Mock external dependencies (database, APIs, storage).
- Aim for 80%+ coverage on business logic.
- Name: `[module].test.ts`

### Integration Tests (Vitest + test database)

- Test API endpoints with real database (test container or in-memory).
- Verify auth, validation, and database state changes.
- Name: `[route].integration.test.ts`

### E2E Tests (Playwright)

- Test critical user flows: login → submit topic → approve → upload → grade.
- Run against staging environment.
- Name: `[flow].spec.ts`

### Test Data

- Use factories (e.g., `faker.js`) to generate test data.
- Never use production data in tests.
- Reset database state before each test suite.

## Error Handling

- Use custom error classes extending `Error`:
  - `ValidationError` → 400
  - `AuthenticationError` → 401
  - `AuthorizationError` → 403
  - `NotFoundError` → 404
  - `ConflictError` → 409
- Catch at route handler level, map to HTTP response.
- Log unexpected errors with context (user, request ID, stack trace).
- Never expose internal error details or stack traces in production responses.

## Logging

- Use structured logging (JSON) in production.
- Include: timestamp, level, message, userId, requestId, traceId.
- Levels: `debug`, `info`, `warn`, `error`.
- Sensitive data (passwords, tokens) must never be logged.
- Audit logs are separate from application logs and are append-only.

## Git Conventions

### Branching

- `main` — production-ready code
- `develop` — integration branch
- `feature/[ticket]-description` — new features
- `fix/[ticket]-description` — bug fixes
- `hotfix/description` — urgent production fixes

### Commits

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(projects): add topic submission workflow`
- `fix(auth): resolve MFA verification timeout`
- `test(documents): add upload validation tests`

### Pull Requests

- Require 1 approval before merge.
- CI must pass (build, lint, test).
- PR description must reference related issue/ticket.
- Squash merge to `develop`.

## Performance

- Lazy load heavy components with `next/dynamic`.
- Use `React.Suspense` for async boundaries.
- Optimize images with `next/image`.
- Debounce search inputs (300ms).
- Paginate lists; default 20 items per page.
- Cache dashboard data with `revalidate` or SWR/React Query.
- Database: add indexes before optimizing queries.
