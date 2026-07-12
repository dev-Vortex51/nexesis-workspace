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
- [ ] 0.5 API Client Setup
- [ ] 0.6 Socket.IO Setup

## Phase 1: Institution & User Management (Backend)

- [ ] 1.1 Institution CRUD
- [ ] 1.2 Department CRUD
- [ ] 1.3 Academic Session CRUD
- [ ] 1.4 User Management
- [ ] 1.5 Supervisor Assignment
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
- 0.4 RBAC Middleware completed: permission matrix in `shared/constants/permissions.ts` (single source of truth) derived strictly from the API spec's explicit role annotations, keyed by the six `User.role` values; `roleHasPermission()` helper. RBAC middleware `server/middleware/rbac.ts` adds `requirePermission(permission)` (static role gate over the matrix), `requireOwnership(resolveOwnerId, bypassPermission?)` (resource-owner gate with admin/privileged override for spec's "author or admin" / "admin or self" cases), and `requireSameInstitution(...)` (tenant isolation); all run after `requireAuth`. Integration tests `tests/integration/rbac.test.ts` spin up a probe Express app on the real auth stack, seed one live user per role, and assert each guard end-to-end (admin-only, coordinator/admin, supervisor-only, student-only, owner-or-admin, plus 401). Build passes; full suite 29/29 (12 new). **Spec deviation**: API spec labels institution endpoints "super-admin only" but no such value exists in the `User.role` enum — those permissions (`INSTITUTION_LIST`/`INSTITUTION_CREATE`) are granted to `admin`, the highest role the data model defines; no new role invented. `hod` and `examiner` receive no role-gated permissions (spec grants them none by name); they operate via ownership/scoped access.
