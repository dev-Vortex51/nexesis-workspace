# Progress Tracker

Update this file after every feature unit completion.

## Current Phase

Backend Implementation

## Current Goal

Implement all backend APIs, services, database logic, and tests before any frontend work.

## Backend-First Rule

**DO NOT implement frontend code until all backend units (0.1–11.5) are complete.**

Backend unit is complete when:

1. API endpoint accepts and returns correct data.
2. Service layer has unit tests.
3. Integration tests pass.
4. `npm run build` passes (server only).

## Completed

- [x] Product requirements defined
- [x] Workflow specification defined
- [x] Data model defined
- [x] API specification defined
- [x] UI specification defined
- [x] Technology stack defined
- [x] Code standards defined
- [x] AI workflow rules defined
- [x] Screen inventory defined
- [x] 104 feature units defined

## Phase 0: Foundation (Backend)

- [x] 0.1 Project Scaffolding
- [x] 0.2 Database Setup
- [x] 0.3 Auth Foundation
- [x] 0.4 RBAC Middleware
- [x] 0.5 API Client Setup
- [x] 0.6 Socket.IO Setup

## Phase 1: Institution & User Management (Backend)

- [x] 1.1 Institution CRUD
- [x] 1.2 Department CRUD
- [x] 1.3 Academic Session CRUD
- [x] 1.4 User Management
- [x] 1.5 Supervisor Assignment
- [ ] 1.6 Dashboard Shell

## Phase 2: Project Lifecycle — Registration to Topic Approval (Backend)

- [ ] 2.1 Project Creation
- [ ] 2.2 Supervisor Assignment Stage
- [ ] 2.3 Topic Proposal Submission
- [ ] 2.4 Topic Approval
- [ ] 2.5 Proposal Document Upload
- [ ] 2.6 Proposal Review

## Phase 3: Document Management & Feedback (Backend)

- [ ] 3.1 Document Upload
- [ ] 3.2 Document Versioning
- [ ] 3.3 Document Viewer Backend
- [ ] 3.4 Inline Comments
- [ ] 3.5 General Comments
- [ ] 3.6 Approval Comments
- [ ] 3.7 Feedback Notifications
- [ ] 3.8 Document Soft Delete

## Phase 4: Chapter Reviews Loop (Backend)

- [ ] 4.1 Chapter Upload
- [ ] 4.2 Chapter Review
- [ ] 4.3 Revision Resubmission
- [ ] 4.4 Chapter Approval
- [ ] 4.5 Progress Calculation

## Phase 5: Final Submission to Defense (Backend)

- [ ] 5.1 Final Thesis Upload
- [ ] 5.2 Supervisor Final Approval
- [ ] 5.3 Defense Scheduling
- [ ] 5.4 Defense Document Upload
- [ ] 5.5 Defense Completion

## Phase 6: Grading (Backend)

- [ ] 6.1 Rubric Management
- [ ] 6.2 Grade Assessment
- [ ] 6.3 Multi-Examiner Grading
- [ ] 6.4 Grade Approval Workflow
- [ ] 6.5 Grade Notifications

## Phase 7: Meetings (Backend)

- [ ] 7.1 Meeting Request
- [ ] 7.2 Meeting Scheduling
- [ ] 7.3 Meeting Reminders
- [ ] 7.4 Attendance Recording
- [ ] 7.5 Meeting Notes

## Phase 8: Communication (Backend)

- [ ] 8.1 In-App Messaging
- [ ] 8.2 Email Notifications
- [ ] 8.3 Push Notifications
- [ ] 8.4 Announcements
- [ ] 8.5 Notification Center

## Phase 9: Dashboards & Reporting (Backend)

- [ ] 9.1 Student Dashboard Backend
- [ ] 9.2 Supervisor Dashboard Backend
- [ ] 9.3 Coordinator Dashboard Backend
- [ ] 9.4 Report Generation
- [ ] 9.5 Report Scheduling

## Phase 10: Audit, Security & Operations (Backend)

- [ ] 10.1 Audit Logging
- [ ] 10.2 Audit Log Query
- [ ] 10.3 MFA Setup
- [ ] 10.4 Rate Limiting
- [ ] 10.5 Data Isolation
- [ ] 10.6 Project Archival
- [ ] 10.7 Backup Verification

## Phase 11: Polish & Launch (Backend)

- [ ] 11.1 PWA Support Backend
- [ ] 11.2 Accessibility Audit Backend
- [ ] 11.3 Performance Optimization Backend
- [ ] 11.4 E2E Test Suite Setup
- [ ] 11.5 API Documentation

---

## FRONTEND PHASE — START ONLY AFTER ALL BACKEND IS COMPLETE

## Phase 12: Auth Pages (Frontend)

- [ ] 12.1 Login Page
- [ ] 12.2 Forgot Password Page
- [ ] 12.3 Reset Password Page
- [ ] 12.4 Onboarding Page

## Phase 13: Dashboard Pages (Frontend)

- [ ] 13.1 Student Dashboard
- [ ] 13.2 Supervisor Dashboard
- [ ] 13.3 Coordinator Dashboard

## Phase 14: Project Detail Page (Frontend)

- [ ] 14.1 Project Detail Page
- [ ] 14.2 Project Overview Tab
- [ ] 14.3 Documents Tab
- [ ] 14.4 Document Viewer
- [ ] 14.5 Feedback Tab
- [ ] 14.6 Meetings Tab
- [ ] 14.7 Timeline Tab

## Phase 15: Modals & Inline Components (Frontend)

- [ ] 15.1 Submit Topics Modal
- [ ] 15.2 Upload Document Modal
- [ ] 15.3 Request Meeting Modal
- [ ] 15.4 Grade Modal
- [ ] 15.5 Approve/Reject Modal
- [ ] 15.6 Chat Panel
- [ ] 15.7 Notification Center Page
- [ ] 15.8 Profile Page

## Phase 16: Coordinator Admin Pages (Frontend)

- [ ] 16.1 Session Settings Page
- [ ] 16.2 Reports Page
- [ ] 16.3 Announcements Page
- [ ] 16.4 Audit Logs Page
- [ ] 16.5 Rubrics Page

## Phase 17: System Admin Pages (Frontend)

- [ ] 17.1 Institutions Page
- [ ] 17.2 Departments Page
- [ ] 17.3 Users Page
- [ ] 17.4 System Settings Page

## Phase 18: Polish (Frontend)

- [ ] 18.1 PWA Support Frontend
- [ ] 18.2 Accessibility Audit Frontend
- [ ] 18.3 Performance Optimization Frontend
- [ ] 18.4 E2E Test Suite Frontend
- [ ] 18.5 Documentation Frontend

---

## Open Questions

- [ ] Should we use tRPC or REST for API client?
- [ ] What is the exact Cloudinary upload preset configuration?
- [ ] Should we add a bulk supervisor assignment feature?

## Architecture Decisions

- **Backend-first**: All backend units (0.1–11.5) must complete before any frontend.
- **Tailwind CSS v4**: `@import "tailwindcss"`, `@theme` block, no `tailwind.config.js`.
- **API/Client separation**: API logic in `server/`, UI in `app/` and `components/`.
- **104 feature units**: 67 backend, 37 frontend.
- **Auth = Better Auth (email/password + JWT plugin)**: httpOnly cookie sessions. Credentials stored in Better Auth's `Account` table (`providerId "credential"`), **not** on `User`. Domain user fields surfaced via `user.additionalFields`; `advanced.database.generateId:false` so PostgreSQL fills UUID ids (keeps FK compatibility with `User.id`).
- **Data-model deviation (0.3)**: `04-data-model.md` specifies `User.passwordHash`; Better Auth mandates credentials live in `Account`. Per approval, `passwordHash` was **dropped** and `name`/`emailVerified`/`image` added to `User`, plus new `Session`/`Account`/`Verification`/`Jwks` tables (migration `20260712103245_add_auth_tables`). All other `User` fields retained.

## Session Notes

- All 104 prompt files generated in `prompts/` directory.
- Each prompt references specific spec sections to prevent hallucination.
- Ready to begin with 0.1: Project Scaffolding.
- 0.1 scaffold completed with Next.js 15, Tailwind CSS v4 tokens, strict TypeScript, and `npm run build` passing.
- 0.3 Auth Foundation completed: Better Auth integrated (`server/auth.ts`), Express auth routes (`POST /register`, `POST /login`, `GET /me`, `PATCH /me`) returning the standard `{success,data,error}` envelope and forwarding httpOnly session cookies; Express `requireAuth` middleware via `auth.api.getSession`; Zod request schemas; injectable `AuthService` with typed error mapping. 12 Vitest unit tests pass; verified end-to-end against local Postgres (register/login/me/patch, plus duplicate→409 and bad-login→401). Better Auth vendored as a repo skill (`.agents/skills/better-auth`, `skills-lock.json`). New deps: `better-auth`, `express`, `vitest`. Local dev DB `nexesis_dev` created; `DATABASE_URL` in `.env` uses `postgres:postgres@localhost:5432`.
- 0.3 security fix (register access control): `POST /auth/register` was public and forwarded `role`/`institutionId`, letting an anonymous caller mint an admin and receive its session cookie (contradicting the API spec's admin-only registration). Fixed by (1) guarding the route with `requireAuth` + `requireRole("admin")` (new middleware helper), (2) enforcing same-institution tenant isolation (cross-institution → 403), and (3) setting `emailAndPassword.autoSignIn: false` so registration never establishes a session — the service `register` now returns only the user (no cookie); the new user logs in separately. Added `tests/integration/auth.register.integration.test.ts` (anonymous→401, non-admin→403, cross-tenant→403, valid admin→201 with no Set-Cookie). Full suite 17/17.
- 0.5 API Infrastructure completed: canonical response-envelope contract in `shared/types/api.ts` (single source of truth) — `ApiResponse<T>`/`ApiSuccessResponse`/`ApiErrorResponse`, `ErrorCode` union + `ERROR_STATUS` map covering exactly the spec's 7 error codes (UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, VALIDATION_ERROR 400, CONFLICT 409, RATE_LIMITED 429, INTERNAL_ERROR 500), `PaginationMeta`, `ApiErrorDetail`. Central error handling in `server/middleware/error-handler.ts`: `errorHandler` (4-arg Express error mw) maps `ZodError`→400 VALIDATION_ERROR w/ field details, `ValidationError`/`AppError`→declared status/code, unknown→500 INTERNAL_ERROR (logged w/ request context, no stack/internals leaked); `notFoundHandler`→404 envelope for unmatched routes. Structured request/response logging `server/middleware/request-logger.ts`: per-request correlation id (`req.requestId`, echoed as `X-Request-Id`, honours inbound), one JSON line on `res.finish` (level by status, method/path/status/durationMs/userId; never bodies/headers/cookies). Rate limiting `server/middleware/rate-limit.ts`: configurable fixed-window in-memory limiter keyed by user id (fallback IP), sets `X-RateLimit-*` + `Retry-After`, emits spec's RATE_LIMITED 429 envelope. Typed client `lib/api-client.ts`: `ApiClient` wraps fetch against `/api/v1` (or `NEXT_PUBLIC_API_URL`), `credentials:"include"` for the httpOnly session cookie, unwraps `data`/`meta` on success and throws typed `ApiClientError(code,message,status,details)` on any error/transport/parse failure. Wired into `server/index.ts` in order: requestLogger → Better Auth → json → /health (exempt) → rateLimit(/api/v1) → routes → notFound → error. `npm run build` + typecheck pass; full suite 33/33 (existing auth/RBAC integration tests green under the new middleware). **Spec note**: the API spec defines the RATE_LIMITED code but no concrete window/ceiling, so the limiter policy is caller-supplied (default 300 req / 60s in `createServer`) rather than inventing a fixed rule; the envelope contract is unaffected.
- 0.4 RBAC Middleware completed: permission matrix in `shared/constants/permissions.ts` (single source of truth) derived strictly from the API spec's explicit role annotations, keyed by the six `User.role` values; `roleHasPermission()` helper. RBAC middleware `server/middleware/rbac.ts` adds `requirePermission(permission)` (static role gate over the matrix), `requireOwnership(resolveOwnerId, bypassPermission?)` (resource-owner gate with admin/privileged override for spec's "author or admin" / "admin or self" cases), and `requireSameInstitution(...)` (tenant isolation); all run after `requireAuth`. Integration tests `tests/integration/rbac.test.ts` spin up a probe Express app on the real auth stack, seed one live user per role, and assert each guard end-to-end (admin-only, coordinator/admin, supervisor-only, student-only, owner-or-admin, plus 401). Build passes; full suite 29/29 (12 new). **Spec deviation**: API spec labels institution endpoints "super-admin only" but no such value exists in the `User.role` enum — the `INSTITUTION_LIST`/`INSTITUTION_CREATE` permissions are granted to **no role** and fail closed (`requirePermission` rejects everyone) until a dedicated system role exists; not widened to `admin`, which would expose global institution management to every institutional admin. `hod` and `examiner` receive no role-gated permissions (spec grants them none by name); they operate via ownership/scoped access. Resolver exceptions in `requireOwnership`/`requireSameInstitution` are forwarded to the error handler (→ 5xx), not masked as 404 — only a deliberate `null` result is a 404.
- 0.6 Socket.IO Foundation completed: real-time transport per `05-api-spec.md` → WebSocket Events. Event contract in `server/websocket/events/contract.ts` (single source of truth) — `SERVER_EVENTS`/`CLIENT_EVENTS` name constants covering exactly the spec's 8 events, typed `ServerToClientEvents`/`ClientToServerEvents` maps, `ProjectStageChangedPayload`/`UserTypingPayload`, `SocketData` (authenticated principal), and `rooms` helpers for the spec's three namespaces (`user:{id}`, `project:{id}`, `institution:{id}`). Server entry `server/websocket/index.ts`: `createSocketServer(httpServer)` attaches a typed Socket.IO `Server` with explicit heartbeat (`pingInterval` 25s / `pingTimeout` 20s) and credentialed CORS; `io.use` handshake auth resolves the Better Auth session via the **same** `auth.api.getSession` path as HTTP (cookie from handshake headers, or `handshake.auth.token` forwarded as cookie) and rejects unauthenticated connections before `connection` fires — principal stashed on `socket.data.user`. Per-connection handlers `server/websocket/events/index.ts`: `registerSocketHandlers` auto-joins the identity-derived `user:`/`institution:` rooms on connect, and the `user:typing` handler (only spec client→server event) lazily joins the `project:` room and relays typing to peers using the **server-authoritative** `userId` (payload's userId ignored — no spoofing). Typed client helper `lib/socket-client.ts`: `createSocketClient()` returns a typed `socket.io-client` connection (`withCredentials` for the httpOnly cookie, optional token) against `NEXT_PUBLIC_SOCKET_URL`/API origin. Wired into `server/index.ts` startup only — the app is wrapped in an explicit `http.Server` shared by API + WebSocket on one port; `createServer()` still returns the bare Express app so existing tests are untouched. New deps: `socket.io`, `socket.io-client`. `npm run build` + typecheck pass; full suite 33/33 green; runtime smoke test confirmed the server initializes and an unauthenticated handshake is rejected with `UNAUTHORIZED`. **Spec/impl notes**: (1) domain-object event payloads (Notification/Message/Document/Feedback/Meeting/Grade) are typed `unknown` for now — concrete shapes are owned by the feature units that emit them; only the fully-specified payloads (`project:stage_changed`, `user:typing`) are typed precisely. (2) The spec defines no standalone project-join event, so `project:` rooms are joined lazily on first typing interaction rather than inventing a join event. (3) `user:typing` also appears in the server→client map because the server relays that same spec event (unchanged name/payload) to project-room peers — not a new event. (4) `contract.ts` was added beyond the two listed files to keep event/room types a single source shared by server and client per code standards (no duplicated type defs).
- 1.1 Institution CRUD completed: the five spec endpoints — `GET/POST /institutions`, `GET/PATCH/DELETE /institutions/:id` — mounted at `/api/v1/institutions` (`server/routes/institutions.ts`) over injectable `InstitutionService` (`server/services/institution.service.ts`, mirrors `AuthService`). Zod boundary schemas in `shared/schemas/institution.ts`: slug validated as lowercase alphanumeric words separated by single hyphens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤100 chars); `settings` JSONB is an arbitrary `Record<string,unknown>`; create body is `{name, slug, settings?}` per spec; update is a strict partial over `{name, slug, logoUrl, settings, subscriptionTier}`; list accepts optional `page`/`limit`. DB uniqueness on slug maps P2002→`CONFLICT` (409). Tests: 18 service unit tests (mocked Prisma — tier defaulting, conflict mapping, soft-delete marker exclusion, pagination) + 7 route integration tests (real auth+RBAC stack, DB-gated like `rbac.test.ts`). `npm run typecheck` passes; full suite 58/58 green against local Postgres. **Authorization** — spec labels all institution endpoints "super-admin only"; consistent with the 0.4 decision, this fails closed: extended `shared/constants/permissions.ts` with `INSTITUTION_GET/UPDATE/DELETE` (alongside existing `LIST/CREATE`), all granted to **no role**, so `requirePermission` rejects every role incl. `admin` (403) until a dedicated system role exists — not widened to `admin`, which would expose the global cross-tenant institution registry to every institutional admin. **Data-model deviation (soft-delete)**: `04-data-model.md` Institution defines no delete column, but the spec's `DELETE` is a soft-delete. Rather than invent a schema column/migration, the deletion marker is written into the existing `settings` JSONB under reserved key `_deletedAt`; reads (`list`/`getById`) exclude marked rows (→ 404 as absent), the marker is stripped from every response, and `update` carries it through a settings replacement so an update can never resurrect a deleted row. `subscriptionTier` is absent from the spec's create body, so `create` defaults it to `"free"` (first enum value). Files beyond the two listed: `shared/schemas/institution.ts` (boundary schemas — no duplicated types, per code standards), `shared/constants/permissions.ts` (+3 permissions), and route wiring in `server/index.ts` — all required to satisfy the build/authorization.
- 0.6 Socket.IO hardening (review follow-up): fixed four issues in the real-time layer. (1) **Project-room authorization** — `user:typing` previously joined `project:{projectId}` from a client-supplied id with no check, letting any authenticated user subscribe to another project's future room events (messages/feedback/uploads/stage changes). `handleUserTyping` is now async and gated by a new exported `canAccessProject(user, projectId, db?)` predicate that enforces tenant isolation first (project must exist AND share the caller's institution), then the spec's GET /projects visibility rules (student→own project, supervisor/examiner/hod→assigned `ProjectMember` only, coordinator/admin→any project in-institution); a failure joins/emits nothing. The predicate takes an injectable Prisma surface (`ProjectAccessDb`) for unit-testing. (2) **Token→cookie** — the handshake `auth.token` was assigned raw as the entire Cookie header, which Better Auth's `getSession` can't resolve; it's now wrapped as `${SESSION_COOKIE_NAME}=<token>` where the name is derived at runtime via `getCookies(auth.options).sessionToken.name` (honours secure/host prefixes), with pass-through for a value that's already a `name=value` header. (3) **Origin enforcement on WS upgrade** — CORS only governs polling, so an `allowRequest` gate was added enforcing `BETTER_AUTH_URL` origin across all transports (incl. the WebSocket upgrade); requests with no `Origin` (non-browser token clients) fall through to the auth gate rather than being locked out. (4) **Socket URL derivation** — `lib/socket-client.ts` fell back to `NEXT_PUBLIC_API_URL` verbatim (e.g. `https://host/api/v1`), which Socket.IO reads as a namespace; `resolveSocketUrl` now strips it to origin via a new `toOrigin()` while passing an explicit `url`/`NEXT_PUBLIC_SOCKET_URL` through unchanged. Tests: `tests/unit/websocket.project-access.test.ts` (9, mocked db — existence/tenant/role matrix) and `tests/unit/socket-client.test.ts` (7, url resolution). typecheck + build pass; full suite **74/74** green.
- 1.2 Department CRUD completed: the five spec endpoints — `GET/POST /departments`, `GET/PATCH/DELETE /departments/:id` — mounted at `/api/v1/departments` (`server/routes/departments.ts`) over injectable `DepartmentService` (`server/services/department.service.ts`, mirrors `InstitutionService`). Zod boundary schemas in `shared/schemas/department.ts`: create body `{name, code}` per spec (name ≤200 chars, code ≤32, both trimmed non-empty); update is a strict partial over `{name, code}`; list accepts optional `page`/`limit`; detail response adds `userCount` + `projectStats {total, active}`. Tests: 14 service unit tests (mocked Prisma — tenant scoping, code-uniqueness→conflict, delete guard, aggregate stats) + 12 route integration tests (real auth+RBAC stack, DB-gated like `institution.routes.integration.test.ts`). `npm run typecheck` passes; full suite **100/100** green against local Postgres (+26). **Authorization** — the spec annotates only `POST /departments` as "admin only" → existing `DEPARTMENT_CREATE` permission (granted to `admin` in the RBAC matrix). The spec attaches NO role annotation to list/get/update/delete, so those require only `requireAuth`; no authorization rule was invented for them. **Tenant isolation (not invented — cross-cutting per 0.4/data-model)**: every service method is scoped to the authenticated caller's `institutionId` (taken from the session, never the body), so a department in another institution reads as absent (404) — verified end-to-end. **Code uniqueness within institution**: the data model defines no DB unique constraint on `Department.code` and this unit adds no migration, so uniqueness is enforced in the service via a scoped `findFirst` (case-insensitive; update excludes self) → `CONFLICT` (409), consistent with 1.1's "no invented schema columns" approach. **Delete guard ("if no active projects")**: hard delete (spec says "Delete department", and Department has no delete/status column — unlike the institution soft-delete). "Active" is defined via the explicit `Project.archivedAt` field (active = `archivedAt IS NULL`), the same definition surfaced in `projectStats.active`; a department with ≥1 active project returns 409. Files beyond the two listed: `shared/schemas/department.ts` (boundary schemas — no duplicated types, per code standards) and route wiring in `server/index.ts` — both required to satisfy the build.
- 1.3 Academic Session CRUD completed: the six spec endpoints — `GET/POST /sessions`, `GET/PATCH /sessions/:id`, `POST /sessions/:id/activate`, `POST /sessions/:id/close` — mounted at `/api/v1/sessions` (`server/routes/sessions.ts`) over injectable `SessionService` (`server/services/session.service.ts`, mirrors `DepartmentService`). Zod boundary schemas in `shared/schemas/session.ts`: create body `{name, startDate, endDate, settings?}` per spec (name ≤200 trimmed; dates coerced; `settings` an open object with optional `topicProposalDeadline`/`finalSubmissionDeadline` ISO-date keys + catchall passthrough — the spec's "Session-specific deadlines"); update is a strict partial over `{name, startDate, endDate, settings}`; list accepts optional `page`/`limit`; detail response adds `projectCounts {total, active, completed}` + `completionRate`. Tests: 16 service unit tests (mocked Prisma — create defaults/status, tenant scoping, aggregate stats + completion rate, activate closing the prior active session, close, P2002→conflict) + 15 route integration tests (real auth+RBAC stack, DB-gated). `npm run typecheck` + `npm run build` pass; full suite **131/131** green against local Postgres (+31). **State machine (from data-model status enum: planning/active/closed/archived)**: sessions are created in `planning`; create/update NEVER set status — it is owned solely by the two transitions. `activate` sets `active` and, per the spec's "closes previous active session", closes any other currently-active session in the same institution — done in a `$transaction` (updateMany other-active→closed, then update self→active) so an institution never has two active sessions. `close` sets `closed` ("no new projects"). No transition preconditions were invented beyond what the spec states. **Authorization** — the spec annotates `POST /sessions` as "coordinator/admin"; this unit's scope directive ("Enforce Coordinator and Admin authorization") extends the SAME gate to the other management writes: added `SESSION_UPDATE`/`SESSION_ACTIVATE`/`SESSION_CLOSE` permissions to `shared/constants/permissions.ts` (alongside existing `SESSION_CREATE`), all granted to `coordinator` + `admin`. The reads (`GET /sessions`, `GET /sessions/:id`) carry no role annotation → `requireAuth` only, tenant-scoped like departments. **Tenant isolation**: every method scoped to the session's `institutionId` (never the body) → a session in another institution reads as absent (404), verified end-to-end. **Name uniqueness**: relies on the data model's existing `@@unique([institutionId, name])`; DB P2002 maps to `CONFLICT` (409) — no in-service pre-check needed (unlike Department.code, which has no DB constraint). Files beyond the two listed: `shared/schemas/session.ts` (boundary schemas), `shared/constants/permissions.ts` (+3 permissions), route wiring in `server/index.ts`, and a `vitest.config.ts` hook/test-timeout bump (30s/20s) — the growing set of DB-gated integration suites seed several Better-Auth/bcrypt users in `beforeAll` and intermittently exceeded the default 10s hook timeout under parallel execution; all required to satisfy the build/tests.
- 1.4 User Management completed: the five spec endpoints — `GET/POST /users`, `GET/PATCH/DELETE /users/:id` — mounted at `/api/v1/users` (`server/routes/users.ts`) over injectable `UserService` (`server/services/user.service.ts`, takes both the Better Auth instance and Prisma, mirrors `AuthService`). Zod boundary schemas in `shared/schemas/user.ts` (reuse the existing `UserResponse` from `shared/schemas/auth.ts` — no duplicated public shape): create body `{email, password, firstName, lastName, role, departmentId?}` (institutionId injected from session, never the body); update is a strict partial over `{firstName, lastName, departmentId, role, status}`; list query is `{role, departmentId, status, search, page, limit}`; detail response extends the user with `roleData {projects, supervisedProjects}`. Tests: 20 service unit tests (mocked Prisma + mocked Better Auth — list filters/search, create incl. duplicate-email→conflict and dept-in-institution validation, role-specific getById, admin-only role/status guard, suspend) + 17 route integration tests (real auth+RBAC stack, DB-gated). `npm run typecheck` + `npm run build` pass; full suite **168/168** green against local Postgres (+37). **Create (role + department assignment)**: goes through Better Auth `signUpEmail` (credential hashed into the Account table — never on User), but unlike public registration (which forces role "student"), the admin sets the role here (the unit's "role assignment") and an optional `departmentId` (the "department assignment"). A duplicate email is caught by an explicit case-insensitive pre-check → `CONFLICT` (409), deterministic rather than relying on the adapter's error surface (`User.email` is globally `@unique`). A `departmentId` must belong to the caller's institution or it's a 400 (tenant isolation on assignment). **Authorization (per the spec's explicit annotations)**: `POST /users` "admin only" → existing `USER_CREATE` permission; `DELETE /users/:id` "admin only" → `USER_SUSPEND`; `PATCH /users/:id` "admin or self" → `requireOwnership(resolveUserOwner, USER_UPDATE_ANY)` — the owner resolver is scoped to the caller's institution so a cross-tenant id is 404, not a leak. `GET /users` and `GET /users/:id` carry no role annotation → `requireAuth` only, tenant-scoped. **Privileged-field guard**: `role` and `status` are admin-only even on a self-PATCH — the route passes `isAdmin = can(user, USER_UPDATE_ANY)` and the service rejects a non-admin update carrying either field (403), so a user cannot escalate their own role or lift their own suspension. **DELETE = suspend (soft state change, not a row delete)**: the spec's DELETE is "Suspend user"; the data model's `User.status` enum has a `suspended` value for exactly this, so the row is retained and status set to `suspended` (verified end-to-end). **getById role-specific data**: `roleData.projects` = the user's own projects (`Project.studentId`, relevant to a student), `roleData.supervisedProjects` = projects the user is a `ProjectMember` of (relevant to supervisor/examiner) — plain relational data from the model, no workflow logic invented; the irrelevant branch stays an empty array. No credential/`mfaSecret` is ever exposed on any payload. Files beyond the two listed: `shared/schemas/user.ts` (boundary schemas) and route wiring in `server/index.ts` — both required to satisfy the build. No new permissions needed (`USER_CREATE`/`USER_UPDATE_ANY`/`USER_SUSPEND` already existed from 0.4).
- 1.5 Supervisor Assignment completed: the spec endpoint `POST /users/:id/assign-supervisor` — "Assign supervisor to student (coordinator/admin)", body `{supervisorId}` — added to `server/routes/users.ts` over a new injectable `SupervisorService` (`server/services/supervisor.service.ts`, takes Prisma; mirrors the other services). The `:id` path param is the **student**; the body carries the supervisor. Zod boundary schema (`AssignSupervisorRequestSchema`, strict `{supervisorId: uuid}`) lives in the service file. Tests: 8 service unit tests (mocked Prisma incl. interactive `$transaction` callback — stage advance from registration/supervisor_assignment, no-move-on-reassignment past that, one-primary-supervisor rule, student/supervisor role validation, tenant isolation, no-active-project) + 6 route integration tests (real auth+RBAC stack, DB-gated: 401/403 authz, coordinator assign+advance, admin reassign keeping a single primary, non-supervisor→400, cross-tenant student→404). `npm run typecheck` + `npm run build` pass; full suite **187/187** green against local Postgres (+19). **Supervision model (04-data-model.md ProjectMember)**: the primary supervisor is the `ProjectMember` row with role `primary_supervisor`. **One-primary-supervisor rule**: assignment runs in a `$transaction` that `deleteMany`s any existing `primary_supervisor` membership then `create`s the single new one, so exactly one primary exists after every call; reassignment is the same swap (verified: 2nd assign leaves one member pointing at the new supervisor). **Stage transition (03-workflow-spec.md)**: Supervisor Assignment (stage 2) exit "Supervisor confirmed" satisfies Topic Proposal's (stage 3) entry "Supervisor assigned", so a project still at `registration` or `supervisor_assignment` advances to `topic_proposal`/`pending` in the same transaction; a project already past that is **only re-supervised** — stage left untouched, since the workflow allows backward movement solely through explicit revision requests (a reassignment is not one). No stage preconditions, reassignment rules, or business logic invented beyond the two specs. **Authorization**: reused the existing `USER_ASSIGN_SUPERVISOR` permission (coordinator+admin, already in the matrix from 0.4) via `requirePermission`. **Tenant isolation**: student, supervisor, and project are all resolved within the caller's `institutionId` (from session, never body) — anything outside reads as absent (404). The service also validates the target `:id` is actually a `student` and the `supervisorId` is a `supervisor` (→400). Operates on the student's active (non-archived) project via `findFirst(archivedAt: null, newest first)`; a student with no active project → 404. Files beyond the two listed: none (route wiring is in the modified `users.ts`; no new permissions/schemas/migrations needed).

