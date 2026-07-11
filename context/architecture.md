# Architecture Context

## Stack

| Layer | Technology | Role |
| ------ | ---------- | ---- |
| Framework | Next.js + TypeScript | Frontend application and server-side rendering |
| Backend | Node.js + Express.js | REST API, business logic, and workflow orchestration |
| UI | Tailwind CSS + shadcn/ui | Responsive and accessible user interface |
| Authentication | Better Auth | Authentication, session management, and role-based access |
| Database | PostgreSQL + Prisma ORM | Persistent storage and data access |
| Real-time | Socket.IO | Real-time notifications and live collaboration |
| Storage | Cloudinary | Document and file storage |
| Email | Brevo | Transactional emails and notifications |
| Background Jobs | Trigger.dev | Scheduled tasks, reminders, and workflow automation |
| Validation | Zod | Request and data validation |

## System Boundaries

- `app` — Owns the frontend application, routing, layouts, dashboards, and user interface.
- `server` — Owns business logic, APIs, workflow execution, authentication, and authorization.
- `database` — Owns data models, migrations, relationships, and persistence.
- `shared` — Owns reusable types, validation schemas, utilities, constants, and shared business rules.

## Storage Model

### Database Entities

- **Users**: Students, supervisors, coordinators, HODs, faculty administrators, external examiners, system administrators. Each user belongs to one institution and has one or more roles.
- **Institutions**: Multi-tenant root entity. Contains configuration, branding, subscription tier, and retention policies.
- **Departments**: Belong to an institution. Define available supervisors and project coordinators.
- **Academic Sessions**: Time-bounded enrollment periods within an institution (e.g., 2025/2026 session). Contain active projects and configurations.
- **Projects**: Belong to a single student, one supervisor, one academic session, and one department. Track current workflow stage, deadlines, and metadata.
- **Workflow States**: Track project progression through defined stages. Each state transition requires validation against workflow rules and required approvals.
- **Documents**: Version-controlled file metadata linked to projects. Store Cloudinary public ID, file name, mime type, uploader, upload timestamp, and version number.
- **Document Versions**: Immutable records of each upload. Previous versions remain accessible but not replaceable.
- **Feedback**: Structured comments linked to specific document versions. Support inline comments, general comments, file annotations, and optional voice notes.
- **Meetings**: Scheduled interactions between students and supervisors. Track type (physical/online), time, location/link, attendance, notes, and reminders.
- **Assessments / Grades**: Rubric-based evaluations by supervisors and examiners. Support multi-examiner grading with automatic aggregation.
- **Notifications**: Multi-channel notification records (in-app, email, push, optional SMS) with delivery status and read receipts.
- **Audit Logs**: Immutable records of all critical actions including actor, action, resource, timestamp, IP address, and before/after state snapshots.
- **Messages**: In-app chat messages between users within a project context.
- **Announcements**: Broadcast messages from coordinators or administrators to targeted user groups.

### Entity Relationships (High-Level)

```
Institution (1) ───► Departments (N)
Institution (1) ───► AcademicSessions (N)
Institution (1) ───► Users (N)
Department (1) ───► Users (N)
AcademicSession (1) ───► Projects (N)
User (Student, 1) ───► Projects (N)
User (Supervisor, 1) ───► Projects (N)
Project (1) ───► WorkflowStates (N)
Project (1) ───► Documents (N)
Document (1) ───► DocumentVersions (N)
DocumentVersion (1) ───► Feedback (N)
Project (1) ───► Meetings (N)
Project (1) ───► Assessments (N)
User (1) ───► Notifications (N)
User (1) ───► AuditLogs (N)
Project (1) ───► Messages (N)
```

### Blob/File Storage

- Project documents, chapter submissions, supporting files, exported reports, and other uploaded artifacts.
- All files stored in Cloudinary with institutional folder isolation (`/{institutionId}/{projectId}/`).
- Maximum upload size: 200 MB per file (configurable per institution).
- Supported file types: PDF, DOCX, PPTX, XLSX, images (JPG, PNG), ZIP.
- Deleted files remain recoverable within institutional retention policy (soft delete with 90-day grace period by default).

## Auth and Access Model

- Every user authenticates using Better Auth and receives a role within an institution.
- Every project belongs to a single student and is supervised through institution-defined academic roles.
- Access is enforced using role-based authorization and project-level ownership, ensuring users only access resources they are permitted to view or modify.
- **Role hierarchy**: System Admin > Institution Admin > Coordinator > HOD > Supervisor > External Examiner > Student.
- **Permission enforcement**: Every API route validates authentication, then authorization, then resource ownership before executing business logic.
- **Session management**: JWT-based sessions with configurable expiry. MFA optional at institutional level, mandatory for admin roles.

## Workflow State Machine

### Defined Stages

```
REGISTRATION → SUPERVISOR_ASSIGNMENT → TOPIC_PROPOSAL → TOPIC_APPROVAL → PROPOSAL → CHAPTER_REVIEWS → FINAL_SUBMISSION → SUPERVISOR_APPROVAL → DEFENSE → COMPLETION → ARCHIVE
```

### Transition Rules

| From | To | Triggered By | Required Approval | Conditions |
|------|-----|-------------|-------------------|------------|
| REGISTRATION | SUPERVISOR_ASSIGNMENT | Auto / Coordinator | — | Student enrolled in active session |
| SUPERVISOR_ASSIGNMENT | TOPIC_PROPOSAL | Auto / Coordinator | — | Supervisor assigned |
| TOPIC_PROPOSAL | TOPIC_APPROVAL | Student submits topics | — | 1–3 topics submitted |
| TOPIC_APPROVAL | PROPOSAL | Supervisor approves | Supervisor | At least one topic approved |
| TOPIC_APPROVAL | TOPIC_PROPOSAL | Supervisor requests revision | Supervisor | Revision reason provided |
| PROPOSAL | CHAPTER_REVIEWS | Student submits proposal | Supervisor | Document uploaded, meets format requirements |
| PROPOSAL | TOPIC_PROPOSAL | Supervisor rejects proposal | Supervisor | Rejection reason provided |
| CHAPTER_REVIEWS | FINAL_SUBMISSION | Student submits all chapters | Supervisor | All required chapters reviewed and approved |
| CHAPTER_REVIEWS | CHAPTER_REVIEWS | Supervisor requests revision | Supervisor | Revision linked to specific chapter version |
| FINAL_SUBMISSION | SUPERVISOR_APPROVAL | Student submits final document | — | All chapters approved, plagiarism check passed (if enabled) |
| SUPERVISOR_APPROVAL | DEFENSE | Supervisor recommends defense | Supervisor | Assessment rubric completed |
| SUPERVISOR_APPROVAL | CHAPTER_REVIEWS | Supervisor requests major revision | Supervisor | Detailed revision requirements documented |
| DEFENSE | COMPLETION | Coordinator confirms defense pass | Coordinator + Examiner(s) | Defense assessment recorded |
| DEFENSE | CHAPTER_REVIEWS | Coordinator requests post-defense revision | Coordinator | Revision scope defined |
| COMPLETION | ARCHIVE | Auto (after retention period) | — | All assessments finalized, documents exported |

### State Machine Invariants

- Stages cannot be skipped. Progression is sequential unless explicitly reversed via revision request.
- Every state transition requires a documented reason in the audit log.
- Automatic transitions (e.g., deadline-triggered escalations) are logged with system as actor.
- A project can only have one active workflow state at any time.

## API Design Patterns

### Request/Response Structure

All API responses follow a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  },
  "error": null
}
```

Error responses:

```json
{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request failed validation",
    "details": [ { "field": "title", "message": "Title is required" } ]
  }
}
```

### Core Endpoint Categories

| Category | Base Path | Description |
|----------|-----------|-------------|
| Auth | `/api/auth/*` | Better Auth routes (login, logout, MFA, password reset) |
| Users | `/api/users` | CRUD, role assignment, profile management |
| Institutions | `/api/institutions` | Configuration, branding, subscription management |
| Departments | `/api/departments` | Department CRUD, supervisor allocation |
| Academic Sessions | `/api/sessions` | Session lifecycle, enrollment, deadlines |
| Projects | `/api/projects` | Project CRUD, workflow transitions, progress |
| Documents | `/api/documents` | Upload, version control, retrieval, soft delete |
| Feedback | `/api/feedback` | Create, retrieve, resolve feedback threads |
| Meetings | `/api/meetings` | Schedule, update, cancel, attendance, notes |
| Assessments | `/api/assessments` | Rubric configuration, grading, approval |
| Notifications | `/api/notifications` | List, mark read, preferences |
| Reports | `/api/reports` | Generate, export, schedule reports |
| Audit Logs | `/api/audit-logs` | Query, filter, export (admin only) |
| Messages | `/api/messages` | Send, retrieve, mark read |
| Announcements | `/api/announcements` | Create, target, publish, archive |

### Rate Limiting

- Authentication endpoints: 5 requests per minute per IP.
- General API: 100 requests per minute per authenticated user.
- File upload: 10 uploads per minute per user.
- Report generation: 5 requests per hour per user.

## Error Handling Strategy

### Error Categories

| Category | HTTP Status | Examples | Client Action |
|----------|-------------|----------|---------------|
| Validation | 400 | Missing fields, invalid format, file type rejected | Display field-level errors |
| Authentication | 401 | Invalid credentials, expired session, missing token | Redirect to login |
| Authorization | 403 | Insufficient role, cross-tenant access attempt | Display access denied message |
| Not Found | 404 | Resource doesn't exist or user lacks visibility | Display 404 page |
| Conflict | 409 | Duplicate topic, concurrent edit, workflow state mismatch | Show conflict resolution UI |
| Rate Limit | 429 | Too many requests | Display retry-after timer |
| Server Error | 500 | Database failure, storage unavailable, unexpected exception | Log error ID, display generic message |

### Edge Cases & Fallbacks

- **File upload failure**: Retry once automatically; if persistent, notify user with error ID and allow re-upload.
- **Cloudinary unavailable**: Queue upload for background retry; notify user of delayed processing.
- **Brevo email failure**: Log failure, retry via Trigger.dev job up to 3 times; fallback to in-app notification only.
- **Supervisor unavailable / on leave**: Coordinator can reassign supervisor; pending approvals transfer to new supervisor with full context.
- **Deadline passed without action**: Auto-escalation notification to coordinator + HOD; project flagged as "at risk".
- **Duplicate topic proposal**: System detects similarity and warns student before submission.
- **Concurrent document edit**: Optimistic locking with version conflict detection; last write wins with audit trail.
- **Corrupted file upload**: Rejected at validation stage with specific error message; user prompted to re-upload.

## Integration Specifications

### Better Auth
- Configure with institutional SSO (SAML 2.0 / OAuth 2.0) where available.
- Fallback to email/password with mandatory email verification.
- Session expiry: 24 hours idle, 7 days absolute.
- MFA: TOTP-based, enforced for System Admin and Institution Admin roles.

### Cloudinary
- Folder structure: `/{institutionId}/{projectId}/{documentType}/`.
- Transformations: Generate thumbnails for images, preview pages for PDFs.
- Backup: Enabled with 30-day backup retention.
- Fallback: If upload fails, store temporarily in PostgreSQL `pending_uploads` table for retry.

### Brevo (Email)
- Templates stored in Brevo dashboard, referenced by template ID.
- Required templates: welcome, password reset, topic submitted, feedback received, meeting reminder, deadline warning, defense scheduled.
- Fallback: If Brevo is unavailable, queue in Trigger.dev and retry with exponential backoff.

### Trigger.dev
- Job types: deadline reminders, overdue escalations, report generation, batch notifications, audit log archiving, data retention cleanup.
- Scheduling: Cron-based for daily/weekly jobs; event-triggered for immediate actions.
- Failure handling: Dead letter queue with admin alerting after 3 consecutive failures.

### Socket.IO
- Namespaces: `/notifications` (user-specific), `/projects` (project-specific for real-time collaboration).
- Authentication: JWT token passed during handshake; reject unauthenticated connections.
- Reconnection: Client attempts reconnection with exponential backoff; missed events synced on reconnect via polling fallback.

## Invariants

1. Every business operation must enforce authentication and role-based authorization before accessing protected resources.
2. Every project stage transition must be validated against the defined workflow and required approvals.
3. Every uploaded document must be versioned and maintain a complete audit history.
4. Every critical action must be recorded in an immutable audit log.
5. Every notification must be delivered through at least one channel (in-app fallback for all).
6. Every institution's data must be isolated at the database query level (no cross-tenant data leakage).
