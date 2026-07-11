# Code Standards

## General

- Keep modules small, cohesive, and single-purpose.
- Solve root causes instead of introducing temporary workarounds.
- Do not mix unrelated business concerns within the same component, service, or route.
- Prefer explicit, readable code over clever one-liners.
- Every function and component must have a single, clearly defined responsibility.

## TypeScript

- Enable strict mode across the entire project.
- Avoid `any`; prefer explicit interfaces, inferred types, or narrowly scoped generics.
- Validate all external input at system boundaries before it reaches business logic.
- Use discriminated unions for state machines and variant types.
- Prefer `readonly` arrays and objects where mutation is not intended.
- Export all public types from a central `types/index.ts` file.

## Next.js

- Default to Server Components whenever possible.
- Add `use client` only when browser interactivity or client-side APIs require it.
- Keep route handlers focused on a single responsibility and delegate business logic to the service layer.
- Use `generateMetadata` for all page metadata.
- Implement proper loading states with `loading.tsx` and error boundaries with `error.tsx`.
- Use parallel routes and intercepting routes only when the UX genuinely benefits from them.

## Styling

- Use CSS custom property design tokens defined in `ui-context.md`; never hardcode color values.
- Follow the border radius scale defined in `ui-context.md`.
- Use Tailwind's `@apply` sparingly; prefer utility classes in JSX.
- Group related Tailwind classes with `clsx` and `tailwind-merge` for conditional styling.
- Maintain consistent spacing using the spacing scale defined in `ui-context.md`.

## API Routes

- Validate and parse every request before executing business logic.
- Enforce authentication, authorization, and resource ownership before every mutation.
- Return consistent and predictable response structures across all endpoints.
- Use Zod schemas for request body, query params, and path params validation.
- Return appropriate HTTP status codes (see `architecture.md` error categories).
- Never expose stack traces or internal error details in production responses.
- Log all API errors with correlation IDs for traceability.

### API Route Structure

```typescript
// Pattern: Validate → Auth → Authorize → Execute → Respond
export async function POST(request: Request) {
  // 1. Parse and validate
  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.issues } }, { status: 400 });
  }

  // 2. Authenticate
  const session = await auth();
  if (!session) {
    return Response.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  // 3. Authorize
  const canCreate = await authorize(session.user.id, "project:create", parsed.data.institutionId);
  if (!canCreate) {
    return Response.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // 4. Execute
  const project = await projectService.create(parsed.data);

  // 5. Respond
  return Response.json({ success: true, data: project }, { status: 201 });
}
```

## Data and Storage

- Store structured business data and relationships in the database.
- Store uploaded documents and large binary assets in object storage.
- Do not store large files or binary content directly in the database.
- Use Prisma transactions for operations that modify multiple related records.
- Always include `institutionId` filters in database queries to enforce tenant isolation.
- Use database indexes on frequently queried fields: `institutionId`, `userId`, `projectId`, `createdAt`, `status`.
- Soft delete records where recovery may be needed; use `deletedAt` timestamp pattern.
- Never delete audit log records.

## File Upload Standards

- Validate file type against allowed MIME types before processing.
- Validate file size against configurable limit (default 200 MB).
- Scan uploads for malware where possible (via Cloudinary or middleware).
- Generate unique filenames with UUID to prevent collisions and enumeration.
- Store original filename in database metadata for user display.
- Upload to Cloudinary with institutional folder isolation.
- On upload failure, store in temporary queue and retry via background job.
- Never trust client-provided file extensions; validate MIME type from file headers.

## Error Handling

- Use custom error classes extending `Error` for domain-specific errors.
- Catch errors at system boundaries (API routes, background jobs, event handlers).
- Log errors with sufficient context: user ID, institution ID, action, timestamp, correlation ID.
- Return user-friendly error messages; log detailed technical information server-side.
- Never swallow errors silently; always log or re-throw.

### Custom Error Classes

```typescript
class ValidationError extends Error { code = "VALIDATION_ERROR"; status = 400; }
class AuthenticationError extends Error { code = "UNAUTHORIZED"; status = 401; }
class AuthorizationError extends Error { code = "FORBIDDEN"; status = 403; }
class NotFoundError extends Error { code = "NOT_FOUND"; status = 404; }
class ConflictError extends Error { code = "CONFLICT"; status = 409; }
class RateLimitError extends Error { code = "RATE_LIMITED"; status = 429; }
class InternalError extends Error { code = "INTERNAL_ERROR"; status = 500; }
```

## Testing Standards

### Unit Tests
- Test all service layer functions in isolation.
- Mock external dependencies (database, storage, email).
- Aim for >80% code coverage in business logic.
- Use descriptive test names: `it("should reject topic proposal when student has no assigned supervisor")`.

### Integration Tests
- Test API routes with real database (test container or isolated schema).
- Verify authentication and authorization enforcement.
- Test file upload and download flows end to end.

### E2E Tests
- Cover critical user journeys: login → submit topic → approve → upload chapter → provide feedback.
- Use Playwright for E2E testing.
- Run against staging environment before production deployment.

## Security Standards

- Never commit secrets, API keys, or database credentials to version control.
- Use environment variables for all configuration; validate at startup with Zod.
- Sanitize all user-generated content before rendering (XSS prevention).
- Use parameterized queries via Prisma (SQL injection prevention).
- Implement CSRF protection for state-changing operations.
- Set secure, HttpOnly, SameSite cookies for session management.
- Enforce HTTPS in production; redirect HTTP to HTTPS.
- Implement Content Security Policy (CSP) headers.
- Rate limit all public-facing endpoints.
- Validate and sanitize file uploads to prevent malicious file execution.
- Run `npm audit` in CI pipeline; fail build on high-severity vulnerabilities.

## File Organization

- `app/` — Application routes, layouts, pages, and route handlers.
- `components/` — Reusable UI components, feature components, and shared presentation logic.
- `server/` — Business logic, services, authentication, authorization, workflows, and data access.
- `lib/` — Shared utilities, helpers, constants, validation schemas, and common infrastructure.

### Directory Conventions

```
app/
  (auth)/           # Route group for auth pages
  (dashboard)/      # Route group for authenticated pages
  api/              # API route handlers
components/
  ui/               # shadcn/ui components (generated, do not modify)
  features/         # Domain-specific components (projects, meetings, etc.)
  layouts/          # Layout-specific components (sidebar, navbar, etc.)
server/
  services/         # Business logic services
  workflows/        # Workflow engine and state machine
  auth/             # Authentication and authorization
  notifications/    # Notification delivery logic
  storage/          # File storage abstraction
lib/
  utils/            # General utilities
  validators/       # Zod schemas
  constants/        # App constants
  hooks/            # Custom React hooks
  types/            # Shared TypeScript types
```

## Git & Version Control

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Keep commits atomic and focused on a single change.
- Write descriptive commit messages explaining *why*, not just *what*.
- Require pull request reviews before merging to main.
- Run lint, type check, and tests in CI before allowing merge.
